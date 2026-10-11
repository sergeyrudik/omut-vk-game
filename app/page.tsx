"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import { createVkBridge, readStoredValue, writeStoredValue } from "./vk-runtime";
import Link from "next/link";
import { createSaveCoordinator } from "./save-coordinator";
import { createAdPolicy } from "./ad-policy";
import { attemptEconomyInterstitial, requestEconomyReward } from "./economy-ads";
import {
  BAIT_DATA,
  BAIT_CAP,
  COIN_CAP,
  FISH_CATALOG,
  LOCATION_DATA,
  RARITY_LABEL,
  UPGRADE_DATA,
  MAX_UPGRADE_LEVEL,
  albumProgress,
  betterRarity,
  buyBait,
  createDefaultSave,
  createFightState,
  evaluateCast,
  getFish,
  gatherEmergencyBait,
  getKeepnetCapacity,
  getUnlockedLocations,
  getUpgradeCost,
  grantBaitPack,
  grantCoins,
  rewardBaitAmount,
  migrateSave,
  refreshDaily,
  refreshRewards,
  resolveCast,
  rollCatch,
  selectNewestSave,
  sellAllKeepnet,
  sellFishValue,
  sellKeepnetFish,
  serializeSave,
  tickFight,
  type BaitId,
  type CaughtFish,
  type DailyProgress,
  type GameSave,
  type GameStats,
  type LocationId,
  type RewardLimits,
  type Upgrades,
} from "./game-engine";

type VKUser = { id?: number; first_name: string; photo_100?: string };
type VKEvent = { detail?: { type?: string } };
type VKBridge = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  subscribe?: (handler: (event: VKEvent) => void) => void;
  unsubscribe?: (handler: (event: VKEvent) => void) => void;
};
type GameTab = "water" | "gear" | "album" | "quests" | "stats";
type Phase = "idle" | "casting" | "waiting" | "fighting" | "result";
type UpgradeKey = keyof Upgrades;

const SAVE_KEY = "omut-save-v1";
const VK_SAVE_KEY = "omut_save";
const REWARD_BAIT = 8;
const REWARD_COOLDOWN_MS = 3 * 60 * 1000;
const REWARD_DAILY_LIMIT = 8;
const VK_APP_URL = "https://vk.com/app54694439";

const DAILY_QUESTS = [
  {
    id: "cast",
    field: "cast" as const,
    target: 8,
    title: "Утренний заброс",
    description: "Сделай 8 забросов",
    reward: { coins: 60 },
  },
  {
    id: "catch",
    field: "catch" as const,
    target: 4,
    title: "Полный садок",
    description: "Поймай 4 рыбы",
    reward: { pearls: 2 },
  },
  {
    id: "sell",
    field: "sell" as const,
    target: 3,
    title: "На рынок",
    description: "Продай 3 рыбы",
    reward: { coins: 80 },
  },
];

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("VK Bridge timeout")), timeoutMs);
    }),
  ]);
}

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<GameTab>("water");
  const [vkReady, setVkReady] = useState(false);
  const [vkUser, setVkUser] = useState<VKUser | null>(null);
  const [paused, setPaused] = useState(false);
  const [adAvailable, setAdAvailable] = useState(false);
  const [interstitialBusy, setInterstitialBusy] = useState(false);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [splash, setSplash] = useState(false);
  const [catchPopup, setCatchPopup] = useState<CaughtFish | null>(null);

  const [coins, setCoins] = useState(80);
  const [pearls, setPearls] = useState(2);
  const [bait, setBait] = useState(createDefaultSave().bait);
  const [selectedBait, setSelectedBait] = useState<BaitId>("worm");
  const [location, setLocation] = useState<LocationId>("backwater");
  const [upgrades, setUpgrades] = useState<Upgrades>({ rod: 0, line: 0, keepnet: 0 });
  const [keepnet, setKeepnet] = useState<CaughtFish[]>([]);
  const [album, setAlbum] = useState<Partial<Record<string, number>>>({});
  const [sound, setSound] = useState(true);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [stats, setStats] = useState<GameStats>(createDefaultSave().stats);
  const [daily, setDaily] = useState<DailyProgress>(createDefaultSave().daily);
  const [, setRewards] = useState<RewardLimits>(createDefaultSave().rewards);
  const [, setNextFishUid] = useState(1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [castPos, setCastPos] = useState(0);
  const [holding, setHolding] = useState(false);
  const [fight, setFight] = useState(() => createFightState({ rod: 0, line: 0, keepnet: 0 }));
  const [lastResult, setLastResult] = useState<string | null>(null);
  const fishingPaused = paused || tab !== "water" || !!message;

  const bridgeRef = useRef<VKBridge | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const adPolicyRef = useRef<ReturnType<typeof createAdPolicy> | null>(null);
  const getAdPolicy = useCallback(() => {
    if (!adPolicyRef.current) adPolicyRef.current = createAdPolicy({
      storageKey: "omut:ad-policy:v1", onInterstitialBusyChange: setInterstitialBusy,
    });
    return adPolicyRef.current;
  }, []);
  useEffect(() => { if (hydrated && started) getAdPolicy().startGameplay(); }, [hydrated, started, getAdPolicy]);
  const saveRef = useRef<GameSave>(createDefaultSave());
  const saveCoordinatorRef = useRef<ReturnType<typeof createSaveCoordinator> | null>(null);
  const resetPendingRef = useRef(false);
  const castPendingRef = useRef(false);
  const fishingGenerationRef = useRef(0);
  const castDir = useRef(1);
  const castRaf = useRef<number | null>(null);
  const fightRaf = useRef<number | null>(null);
  const biteTimeout = useRef<number | null>(null);
  const pendingCatchRef = useRef<CaughtFish | null>(null);
  const holdingRef = useRef(false);
  const fightRef = useRef(fight);

  const unlocked = useMemo(() => getUnlockedLocations(stats.catches), [stats.catches]);
  const capacity = getKeepnetCapacity(upgrades);
  const albumStats = albumProgress(album);
  const tutorialText = useMemo(() => {
    if (tutorialDone) return null;
    if (tutorialStep === 0) return "Выбери наживку и нажми «Заброс». Останови стрелку в зелёной зоне.";
    if (tutorialStep === 1) return "Дождись поклёвки, затем удерживай и отпускай кнопку, чтобы держать натяжение в зелёной зоне.";
    return "Рыба автоматически добавляется в альбом. Продай улов из садка и улучшай снасти на вкладке «Снасти».";
  }, [tutorialDone, tutorialStep]);

  const playSound = useCallback(
    (kind: "tap" | "cast" | "catch" | "error") => {
      if (!sound || typeof window === "undefined") return;
      try {
        const context = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = context;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const frequencies = { tap: 380, cast: 520, catch: 760, error: 150 };
        oscillator.frequency.value = frequencies[kind];
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.16);
      } catch {
        // optional
      }
    },
    [sound],
  );

  const trackEvent = useCallback((eventName: string, params: Record<string, string | number | boolean> = {}) => {
    if (!bridgeRef.current) return;
    const eventParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      eventParams[key] = String(value);
    });
    void bridgeRef.current
      .send("VKWebAppTrackEvent", { event_name: eventName, event_params: eventParams })
      .catch(() => undefined);
  }, []);

  const applySave = useCallback((save: GameSave) => {
    saveRef.current = save;
    setCoins(save.coins);
    setPearls(save.pearls);
    setBait(save.bait);
    setSelectedBait(save.selectedBait);
    setLocation(save.location);
    setUpgrades(save.upgrades);
    setKeepnet(save.keepnet);
    setAlbum(save.album);
    setSound(save.sound);
    setTutorialDone(save.tutorialDone);
    setTutorialStep(save.tutorialDone ? 2 : save.tutorialStep);
    setStats(save.stats);
    setDaily(refreshDaily(save.daily));
    getAdPolicy().seedLastAdAt(save.rewards.lastRewardAt);
    setRewards(refreshRewards(save.rewards));
    setNextFishUid(save.nextFishUid);
  }, [getAdPolicy]);

  const cancelFishing = useCallback(() => {
    fishingGenerationRef.current += 1;
    if (biteTimeout.current !== null) window.clearTimeout(biteTimeout.current);
    if (castRaf.current !== null) window.cancelAnimationFrame(castRaf.current);
    if (fightRaf.current !== null) window.cancelAnimationFrame(fightRaf.current);
    biteTimeout.current = null;
    castRaf.current = null;
    fightRaf.current = null;
    pendingCatchRef.current = null;
    holdingRef.current = false;
    castDir.current = 1;
    const freshFight = createFightState({ rod: 0, line: 0, keepnet: 0 });
    fightRef.current = freshFight;
    setFight(freshFight);
    setHolding(false);
    setCastPos(0);
    setPhase("idle");
    setCatchPopup(null);
    setLastResult(null);
    setSplash(false);
  }, []);

  const getSaveCoordinator = useCallback(() => {
    if (!saveCoordinatorRef.current) saveCoordinatorRef.current = createSaveCoordinator({
      read: () => readStoredValue(SAVE_KEY), write: (value) => writeStoredValue(SAVE_KEY, value),
      parse: (value) => migrateSave(value) ?? createDefaultSave(), serialize: serializeSave,
      withLock: async (run) => navigator.locks ? await navigator.locks.request(`${SAVE_KEY}:write`, run) : await run(),
    });
    return saveCoordinatorRef.current;
  }, []);

  const synchronizeSave = useCallback(() => {
    const external = getSaveCoordinator().refresh();
    if (external) {
      if (external.stats.casts < saveRef.current.stats.casts || external.nextFishUid < saveRef.current.nextFishUid) cancelFishing();
      applySave(external);
    }
    return external ?? saveRef.current;
  }, [applySave, getSaveCoordinator, cancelFishing]);

  const commitSave = useCallback(async (transform: (current: GameSave) => GameSave | null) => {
    const result = await getSaveCoordinator().transact((current) => {
      if (current.stats.casts < saveRef.current.stats.casts || current.nextFishUid < saveRef.current.nextFishUid) cancelFishing();
      return transform(current);
    });
    if (result.external) applySave(result.external);
    if (result.value && (result.localWritten === false || readStoredValue(SAVE_KEY) === result.value)) {
      void bridgeRef.current?.send("VKWebAppStorageSet", { key: VK_SAVE_KEY, value: result.value }).catch(() => undefined);
    }
    return result;
  }, [applySave, getSaveCoordinator, cancelFishing]);

  useEffect(() => {
    if (!hydrated) return;
    const listener = (event: StorageEvent) => { if (event.key === SAVE_KEY || event.key === null) synchronizeSave(); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [hydrated, synchronizeSave]);

  const checkRewardAvailability = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const response = (await bridgeRef.current.send("VKWebAppCheckNativeAds", {
        ad_format: "reward",
      })) as { result?: boolean };
      setAdAvailable(response.result === true);
    } catch {
      setAdAvailable(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      let cloudSave: GameSave | null = null;
      try {
        await promiseWithTimeout(bridge.send("VKWebAppInit"), 1800);
        if (cancelled) return;
        bridgeRef.current = createVkBridge(bridge as unknown as VKBridge);
        setVkReady(true);
        try {
          void bridgeRef.current.send("VKWebAppSetViewSettings", {
            status_bar_style: "light",
            action_bar_color: "#1f5a6e",
            navigation_bar_color: "#1f5a6e",
          }).catch(() => undefined);
        } catch {
          // optional
        }
        try {
          void bridgeRef.current.send("VKWebAppGetUserInfo").then((user) => {
            if (!cancelled) setVkUser(user as VKUser);
          }).catch(() => undefined);
        } catch {
          // optional
        }
        try {
          const storage = (await bridgeRef.current.send("VKWebAppStorageGet", {
            keys: [VK_SAVE_KEY],
          })) as { keys?: Array<{ value: string }> };
          cloudSave = migrateSave(storage.keys?.[0]?.value);
        } catch {
          trackEvent("save_load_error", { source: "vk" });
        }
      } catch {
        bridgeRef.current = null;
        setVkReady(false);
      }
      if (cancelled) return;
      const raw = readStoredValue(SAVE_KEY);
      getSaveCoordinator().initialize(raw, selectNewestSave(migrateSave(raw), cloudSave) ?? createDefaultSave());
      await commitSave((current) => current);
      setHydrated(true);
      trackEvent("app_open");
      void checkRewardAvailability();
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [commitSave, getSaveCoordinator, checkRewardAvailability, trackEvent]);

  useEffect(() => {
    const handler = (event: VKEvent) => {
      if (event.detail?.type === "VKWebAppViewHide") setPaused(true);
      if (event.detail?.type === "VKWebAppViewRestore") setPaused(false);
    };
    bridge.subscribe?.(handler);
    return () => bridge.unsubscribe?.(handler);
  }, []);

  useEffect(() => {
    holdingRef.current = holding;
  }, [holding]);

  useEffect(() => {
    if (fishingPaused) {
      holdingRef.current = false;
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (!cancelled) setHolding(false);
      });
      return () => { cancelled = true; };
    }
  }, [fishingPaused]);

  useEffect(() => {
    fightRef.current = fight;
  }, [fight]);

  useEffect(() => {
    if (phase !== "casting" || fishingPaused) return;
    const step = () => {
      setCastPos((prev) => {
        let next = prev + castDir.current * 0.018;
        if (next >= 1) {
          next = 1;
          castDir.current = -1;
        } else if (next <= 0) {
          next = 0;
          castDir.current = 1;
        }
        return next;
      });
      castRaf.current = window.requestAnimationFrame(step);
    };
    castRaf.current = window.requestAnimationFrame(step);
    return () => {
      if (castRaf.current) window.cancelAnimationFrame(castRaf.current);
    };
  }, [phase, fishingPaused]);

  const finishEscape = useCallback(async () => {
    const generation = fishingGenerationRef.current;
    const pending = pendingCatchRef.current;
    await commitSave((current) => generation !== fishingGenerationRef.current || (pending && current.nextFishUid <= pending.uid) ? null : ({ ...current, stats: { ...current.stats, escapes: current.stats.escapes + 1 } }));
    if (generation !== fishingGenerationRef.current) return;
    setLastResult("Рыба сорвалась"); pendingCatchRef.current = null; setPhase("idle"); playSound("error");
  }, [commitSave, playSound]);

  const finishCatch = useCallback(async (fish: CaughtFish) => {
    const generation = fishingGenerationRef.current;
    const result = await commitSave((current) => {
      if (generation !== fishingGenerationRef.current || current.nextFishUid <= fish.uid) return null;
      if (current.keepnet.some((item) => item.uid === fish.uid) || current.keepnet.length >= getKeepnetCapacity(current.upgrades)) return null;
      const daily = refreshDaily(current.daily);
      return { ...current, keepnet: [...current.keepnet, fish], album: { ...current.album, [fish.fishId]: Math.min(9999, (current.album[fish.fishId] ?? 0) + 1) },
        stats: { ...current.stats, catches: current.stats.catches + 1, bestRarity: betterRarity(current.stats.bestRarity, fish.rarity), locationsUnlocked: getUnlockedLocations(current.stats.catches + 1).length },
        daily: { ...daily, catch: daily.catch + 1 }, tutorialStep: Math.min(2, current.tutorialStep + 1), tutorialDone: current.tutorialDone || current.tutorialStep >= 1 };
    });
    if (generation !== fishingGenerationRef.current) return;
    pendingCatchRef.current = null; setPhase("idle");
    if (!result.value) { setMessage("Садок полон или заброс отменён — продай улов и повтори"); return; }
    setLastResult(`${getFish(fish.fishId).icon} ${getFish(fish.fishId).name} · ${fish.weight} кг`); setCatchPopup(fish); setSplash(true);
    window.setTimeout(() => setSplash(false), 450); playSound("catch");
    void bridgeRef.current?.send("VKWebAppTapticNotificationOccurred", { type: "success" }).catch(() => undefined);
    trackEvent("fish_caught", { id: fish.fishId, rarity: fish.rarity });
  }, [commitSave, playSound, trackEvent]);

  useEffect(() => {
    if (phase !== "fighting" || fishingPaused) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      const next = tickFight(fightRef.current, holdingRef.current, dt);
      const updated = { ...fightRef.current, tension: next.tension, progress: next.progress };
      fightRef.current = updated;
      setFight(updated);
      if (next.status === "caught" && pendingCatchRef.current) {
        finishCatch(pendingCatchRef.current);
        return;
      }
      if (next.status === "escaped") {
        finishEscape();
        return;
      }
      fightRaf.current = window.requestAnimationFrame(step);
    };
    fightRaf.current = window.requestAnimationFrame(step);
    return () => {
      if (fightRaf.current) window.cancelAnimationFrame(fightRaf.current);
    };
  }, [finishCatch, finishEscape, phase, fishingPaused]);

  const maybeShowInterstitial = useCallback(async (boundary: "sale-one" | "sale-all") => {
    const client = bridgeRef.current;
    if (!client || !started || catchPopup) return false;
    return attemptEconomyInterstitial(getAdPolicy(), "omut", boundary, {
      send: (method, params) => client.send(method, params), ready: vkReady, paused, phase,
    });
  }, [getAdPolicy, started, catchPopup, vkReady, paused, phase]);

  const startCast = () => {
    if (phase !== "idle" || paused || getAdPolicy().isBusy() || resetPendingRef.current || castPendingRef.current) return;
    getAdPolicy().startGameplay();
    const current = synchronizeSave();
    if ((current.bait[current.selectedBait] ?? 0) <= 0) { setMessage("Нет наживки — купи на снастях или собери червяка, если запас исчерпан"); return; }
    if (current.keepnet.length >= getKeepnetCapacity(current.upgrades)) { setMessage("Садок полон"); return; }
    setCastPos(0); castDir.current = 1; setPhase("casting"); setLastResult(null); playSound("tap");
  };

  const lockCast = async () => {
    if (phase !== "casting" || paused || getAdPolicy().isBusy() || resetPendingRef.current || castPendingRef.current) return;
    castPendingRef.current = true;
    const generation = fishingGenerationRef.current;
    if (castRaf.current) window.cancelAnimationFrame(castRaf.current);
    const quality = evaluateCast(castPos);
    let fish: CaughtFish | null = null;
    let cast: ReturnType<typeof resolveCast> | null = null;
    let castUpgrades = saveRef.current.upgrades;
    try {
      const result = await commitSave((current) => {
        if (generation !== fishingGenerationRef.current || current.bait[current.selectedBait] <= 0 || current.keepnet.length >= getKeepnetCapacity(current.upgrades)) return null;
        castUpgrades = current.upgrades;
        cast = resolveCast(quality, current.location, current.upgrades, current.selectedBait);
        if (quality !== "miss") fish = rollCatch(current.location, current.upgrades, current.selectedBait, quality, current.nextFishUid);
        const daily = refreshDaily(current.daily);
        return { ...current, bait: { ...current.bait, [current.selectedBait]: current.bait[current.selectedBait] - 1 },
          stats: { ...current.stats, casts: current.stats.casts + 1 }, daily: { ...daily, cast: daily.cast + 1 },
          tutorialStep: current.tutorialDone ? current.tutorialStep : Math.max(1, current.tutorialStep), nextFishUid: current.nextFishUid + (fish ? 1 : 0) };
      });
      if (generation !== fishingGenerationRef.current) return;
      if (!result.value) { setPhase("idle"); setMessage("Нет наживки или садок полон — проверь снасти и повтори"); return; }
      playSound("cast");
      if (!fish || !cast) { setLastResult("Мимо — наживка ушла"); setPhase("idle"); playSound("error"); return; }
      pendingCatchRef.current = fish; setPhase("waiting"); setLastResult(quality === "perfect" ? "Идеальный заброс!" : "Заброс удался");
      biteTimeout.current = window.setTimeout(() => {
        biteTimeout.current = null;
        if (generation !== fishingGenerationRef.current || !pendingCatchRef.current) return;
        synchronizeSave();
        if (generation !== fishingGenerationRef.current || !pendingCatchRef.current) return;
        setFight(createFightState(castUpgrades)); setPhase("fighting"); setHolding(false);
      }, (cast as ReturnType<typeof resolveCast>).biteDelayMs);
    } finally { castPendingRef.current = false; }
  };

  useEffect(() => {
    return () => {
      if (biteTimeout.current) window.clearTimeout(biteTimeout.current);
    };
  }, []);

  const resetProgress = async () => {
    if (getAdPolicy().isBusy() || resetPendingRef.current) return;
    resetPendingRef.current = true; cancelFishing();
    try {
      await commitSave((current) => { const fresh = createDefaultSave(); fresh.rewards = refreshRewards(current.rewards); return fresh; });
      setTab("water"); setStarted(false); setMessage("Прогресс сброшен");
    } finally { resetPendingRef.current = false; }
  };

  const buyUpgrade = async (key: UpgradeKey) => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    let reason = "Не хватает жемчуга";
    const result = await commitSave((current) => {
      if (current.upgrades[key] >= MAX_UPGRADE_LEVEL) { reason = "Максимальный уровень улучшения"; return null; }
      const cost = getUpgradeCost(current.upgrades[key]);
      if (current.pearls < cost) return null;
      return { ...current, pearls: current.pearls - cost, upgrades: { ...current.upgrades, [key]: current.upgrades[key] + 1 } };
    });
    if (!result.value) setMessage(reason); else trackEvent("upgrade_buy", { key });
  };

  const claimQuest = async (id: string) => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    const quest = DAILY_QUESTS.find((item) => item.id === id); if (!quest) return;
    await commitSave((current) => {
      const daily = refreshDaily(current.daily);
      if (daily.claimed.includes(id) || daily[quest.field] < quest.target) return null;
      return grantCoins({ ...current, daily: { ...daily, claimed: [...daily.claimed, id] }, pearls: Math.min(9999, current.pearls + (quest.reward.pearls ?? 0)) }, quest.reward.coins ?? 0);
    });
  };

  const recoverBait = async () => {
    if (paused || phase !== "idle" || getAdPolicy().isBusy() || resetPendingRef.current) return;
    const result = await commitSave((current) => { const bait = gatherEmergencyBait(current.bait, current.coins, current.keepnet); return bait ? { ...current, bait, selectedBait: "worm" } : null; });
    if (result.value) setMessage("Нашёл одного червяка — можно снова рыбачить");
  };

  const purchaseBait = async (id: BaitId) => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    let reason = "Не хватает монет";
    const result = await commitSave((current) => { const bought = buyBait(current.bait, current.coins, id, 5);
      if (!bought.ok) { reason = current.bait[id] + 5 > BAIT_CAP ? "Недостаточно места для 5 наживок" : reason; return null; }
      return { ...current, bait: bought.bait, coins: bought.coins };
    });
    if (!result.value) setMessage(reason);
  };

  const watchRewardAd = async () => {
    if (paused || phase !== "idle" || catchPopup || getAdPolicy().isBusy()) return;
    const client = bridgeRef.current;
    const current = synchronizeSave();
    const fresh = refreshRewards(current.rewards);
    const outcome = await requestEconomyReward({
      policy: getAdPolicy(), send: (method, params) => client!.send(method, params),
      available: !!client && vkReady && adAvailable, count: fresh.count, lastRewardAt: fresh.lastRewardAt,
      dailyLimit: REWARD_DAILY_LIMIT, cooldownMs: REWARD_COOLDOWN_MS,
      rewardValue: rewardBaitAmount(current.bait, REWARD_BAIT), onBusyChange: setRewardBusy,
      onGranted: async (watchedAt, amount) => {
        let actualAmount = amount;
        await commitSave((saved) => { const quota = refreshRewards(saved.rewards); actualAmount = rewardBaitAmount(saved.bait, amount);
          return { ...saved, rewards: { ...quota, count: quota.count + 1, lastRewardAt: watchedAt }, stats: { ...saved.stats, adsWatched: saved.stats.adsWatched + 1 }, bait: grantBaitPack(saved.bait, actualAmount) };
        });
        setMessage(actualAmount > 0 ? `Червяки за рекламу: +${actualAmount}` : "Запас червяков полон");
      },
    });
    if (outcome !== "granted") setMessage(outcome === "wait" ? "Подождите немного" : outcome === "daily-limit" ? "Дневной лимит наград исчерпан" : outcome === "no-value" ? "Запас червяков полон" : "Реклама пока недоступна");
    void checkRewardAvailability();
  };

  const sellOne = async (uid: number) => {
    if (paused || phase !== "idle" || catchPopup || getAdPolicy().isBusy() || resetPendingRef.current) return;
    const saved = await commitSave((current) => {
      const result = sellKeepnetFish(current.keepnet, uid); if (current.coins >= COIN_CAP || !result.coins) return null;
      const daily = refreshDaily(current.daily);
      return grantCoins({ ...current, keepnet: result.keepnet, daily: { ...daily, sell: daily.sell + 1 } }, result.coins);
    });
    if (saved.value) void maybeShowInterstitial("sale-one");
  };

  const sellAll = async () => {
    if (paused || phase !== "idle" || catchPopup || getAdPolicy().isBusy() || resetPendingRef.current) return;
    const saved = await commitSave((current) => {
      const result = sellAllKeepnet(current.keepnet); if (current.coins >= COIN_CAP || !result.coins) return null;
      const daily = refreshDaily(current.daily);
      return grantCoins({ ...current, keepnet: [], daily: { ...daily, sell: daily.sell + current.keepnet.length } }, result.coins);
    });
    if (saved.value) void maybeShowInterstitial("sale-all");
  };

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="loading-screen">ЗАГРУЗКА…</div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="app-shell">
        <div className="start-screen">
          <div className="start-hero">
            <div className="start-scene" aria-hidden>
              <div className="sun" />
              <div className="mist" />
              <div className="reed l" />
              <div className="reed r" />
              <div className="pier" />
              <div className="bobber" />
            </div>
            <h1 className="start-brand">Омут</h1>
            <p className="start-tagline">Тихая заводь — закинь удочку!</p>
            <button type="button" className="start-play" onClick={() => setStarted(true)}>
              На мостки
            </button>
            <div className="start-links">
              <Link href="/privacy/">Конфиденциальность</Link>
              <Link href="/terms/">Соглашение</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const rewardBait = rewardBaitAmount(bait, REWARD_BAIT);

  return (
    <div className="app-shell">
      <fieldset disabled={interstitialBusy || rewardBusy} style={{ display: "contents" }}>
      <div className="game-frame">
        <header className="topbar">
          <div>
            <h1 className="brand-mini">Омут</h1>
            <p className="muted">{vkUser ? vkUser.first_name : vkReady ? "ВКонтакте" : "Локальная заводь"}</p>
          </div>
          <div className="economy">
            <span className="chip">🪙 {coins}</span>
            <span className="chip">🦪 {pearls}</span>
          </div>
        </header>

        {tab === "water" && (
          <section className={`panel${splash ? " splash" : ""}`}>
            <div className="topbar" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Заводь</h2>
              <button type="button" className="btn secondary" onClick={() => void commitSave((current) => ({ ...current, sound: !current.sound }))}>
                {sound ? "🔊" : "🔇"}
              </button>
            </div>
            {tutorialText && <div className="tutorial-banner">{tutorialText}</div>}

            <div className="loc-row">
              {LOCATION_DATA.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  className={`loc-pill${location === loc.id ? " active" : ""}`}
                  disabled={!unlocked.includes(loc.id)}
                  onClick={() => void commitSave((current) => getUnlockedLocations(current.stats.catches).includes(loc.id) ? ({ ...current, location: loc.id }) : null)}
                >
                  {loc.title}
                  {!unlocked.includes(loc.id) ? " 🔒" : ""}
                </button>
              ))}
            </div>

            <div className={`water-stage loc-${location} ${phase}`}>
              <div className="stage-status">
                {phase === "idle" && (lastResult ?? "Готов к забросу")}
                {phase === "casting" && "Лови момент — зелёная зона, жёлтая = идеал"}
                {phase === "waiting" && "Тишина… поплавок дрожит"}
                {phase === "fighting" && "Вываживание! Удерживай натяжение в зелёной зоне"}
              </div>
              <div className="scene-reed a" />
              <div className="scene-reed b" />
              <div className="pier-plank" />
              <div className="cast-line" />
              <div className="bobber-live" />
              <div className="ripple" />
            </div>

            <div className="hud-row">
              <span className="keepnet-meta">
                {BAIT_DATA[selectedBait].icon} {BAIT_DATA[selectedBait].title}: {bait[selectedBait]}
              </span>
              <span className="keepnet-meta">
                Садок {keepnet.length}/{capacity}
              </span>
            </div>

            <div className="bait-row">
              {(Object.keys(BAIT_DATA) as BaitId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`bait-pill${selectedBait === id ? " active" : ""}`}
                  disabled={phase !== "idle"}
                  onClick={() => void commitSave((current) => ({ ...current, selectedBait: id }))}
                >
                  {BAIT_DATA[id].icon} {BAIT_DATA[id].title} · {bait[id]}
                </button>
              ))}
            </div>

            {phase === "casting" && (
              <>
                <div className="meter-label">
                  <span>Заброс</span>
                  <span>Стоп в зоне</span>
                </div>
                <div className="cast-meter">
                  <div className="cast-zone" style={{ left: "28%", width: "44%" }} />
                  <div className="cast-perfect" />
                  <div className="cast-needle" style={{ left: `${castPos * 100}%` }} />
                </div>
              </>
            )}

            {phase === "fighting" && (
              <>
                <div className="meter-label">
                  <span>Натяжение</span>
                  <span>{Math.round(fight.progress * 100)}%</span>
                </div>
                <div
                  className={`fight-meter${
                    fight.tension < fight.window.min || fight.tension > fight.window.max ? " danger" : ""
                  }`}
                >
                  <div
                    className="fight-zone"
                    style={{
                      left: `${fight.window.min * 100}%`,
                      width: `${(fight.window.max - fight.window.min) * 100}%`,
                    }}
                  />
                  <div className="fight-needle" style={{ left: `${fight.tension * 100}%` }} />
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${fight.progress * 100}%` }} />
                </div>
              </>
            )}

            <div className="btn-row">
              {phase === "idle" && (
                <button type="button" className="btn" onClick={startCast}>
                  🎣 Заброс
                </button>
              )}
              {phase === "casting" && (
                <button type="button" className="btn" onClick={lockCast}>
                  ⏱ Стоп!
                </button>
              )}
              {phase === "fighting" && (
                <button
                  type="button"
                  className={`btn${holding ? " hold-active" : ""}`}
                  onPointerDown={() => setHolding(true)}
                  onPointerUp={() => setHolding(false)}
                  onPointerLeave={() => setHolding(false)}
                  onPointerCancel={() => setHolding(false)}
                >
                  {holding ? "⬆ Тяну…" : "✋ Удерживай"}
                </button>
              )}
              {phase === "waiting" && (
                <button type="button" className="btn secondary" disabled>
                  …ждём поклёвку
                </button>
              )}
              {phase === "idle" && gatherEmergencyBait(bait, coins, keepnet) && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={recoverBait}
                >
                  Собрать наживку · +1 червяк
                </button>
              )}
              <button type="button" className="btn secondary" disabled={rewardBait <= 0 || phase !== "idle" || !!catchPopup} onClick={() => void watchRewardAd()}>
                {rewardBait > 0 ? `Червяки за рекламу: +${rewardBait}` : "Запас червяков полон"}
              </button>
            </div>

            {keepnet.length > 0 && (
              <div className="list" style={{ marginTop: 12 }}>
                {keepnet.map((fish) => {
                  const def = getFish(fish.fishId);
                  const price = Math.min(sellFishValue(fish), Math.max(0, COIN_CAP - coins));
                  return (
                    <div key={fish.uid} className="card">
                      <div>
                        <h3>
                          {def.icon} {def.name}
                        </h3>
                        <p>
                          <span className={`rarity-dot rarity-${fish.rarity}`} />
                          {fish.weight} кг · {RARITY_LABEL[fish.rarity]} · {price}🪙
                        </p>
                      </div>
                      <button type="button" className="btn secondary" disabled={coins >= COIN_CAP || phase !== "idle" || !!catchPopup} onClick={() => sellOne(fish.uid)}>
                        Продать
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="btn" disabled={coins >= COIN_CAP || phase !== "idle" || !!catchPopup} onClick={sellAll}>
                  Продать всё
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "gear" && (
          <section className="panel">
            <h2>Снасти</h2>
            <div className="list">
              {(Object.keys(UPGRADE_DATA) as UpgradeKey[]).map((key) => {
                const data = UPGRADE_DATA[key];
                const cost = getUpgradeCost(upgrades[key]);
                return (
                  <div key={key} className="card">
                    <div>
                      <h3>
                        {data.icon} {data.title} · {upgrades[key]}
                      </h3>
                      <p>
                        {data.description}. {data.bonus(upgrades[key])}
                      </p>
                    </div>
                    <button type="button" className="btn" disabled={upgrades[key] >= MAX_UPGRADE_LEVEL} onClick={() => buyUpgrade(key)}>
                      {upgrades[key] >= MAX_UPGRADE_LEVEL ? "Максимум" : `💎 ${cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {(Object.keys(BAIT_DATA) as BaitId[]).map((id) => (
                <div key={id} className="card">
                  <div>
                    <h3>
                      {BAIT_DATA[id].icon} {BAIT_DATA[id].title}
                    </h3>
                    <p>5 шт. за {BAIT_DATA[id].cost * 5} монет</p>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={bait[id] + 5 > BAIT_CAP}
                    onClick={() => void purchaseBait(id)}
                  >
                    {bait[id] + 5 > BAIT_CAP ? "Запас полон" : "Купить"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "album" && (
          <section className="panel">
            <h2>Альбом</h2>
            <p className="muted">
              Виды: {albumStats.caught}/{albumStats.total}
            </p>
            <div className="album-grid">
              {FISH_CATALOG.map((fish) => {
                const count = album[fish.id] ?? 0;
                return (
                  <div
                    key={fish.id}
                    className={`album-cell${count ? " owned" : " locked"} rarity-border-${fish.rarity}`}
                  >
                    <span className="icon">{count ? fish.icon : "❔"}</span>
                    {count ? fish.name : "???"}
                    {count > 0 && (
                      <div className="muted">
                        <span className={`rarity-dot rarity-${fish.rarity}`} />×{count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "quests" && (
          <section className="panel">
            <h2>Задания</h2>
            <p className="muted">Обновляются каждый день · {daily.date}</p>
            <div className="list">
              {DAILY_QUESTS.map((quest) => {
                const progress = daily[quest.field];
                const claimed = daily.claimed.includes(quest.id);
                const ready = progress >= quest.target && !claimed;
                const pct = Math.min(100, Math.round((progress / quest.target) * 100));
                return (
                  <div key={quest.id} className="card">
                    <div style={{ flex: 1 }}>
                      <h3>{quest.title}</h3>
                      <p>
                        {quest.description} · {Math.min(progress, quest.target)}/{quest.target}
                      </p>
                      <div className="quest-bar">
                        <div className="quest-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <button type="button" className="btn" disabled={!ready} onClick={() => claimQuest(quest.id)}>
                      {claimed ? "Готово" : ready ? "Забрать" : "Ещё"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section className="panel">
            <h2>Итоги</h2>
            <div className="list">
              <div className="card"><span>Забросов</span><strong>{stats.casts}</strong></div>
              <div className="card"><span>Уловов</span><strong>{stats.catches}</strong></div>
              <div className="card"><span>Срывов</span><strong>{stats.escapes}</strong></div>
              <div className="card"><span>Монет с продажи</span><strong>{stats.coinsEarned}</strong></div>
              <div className="card"><span>Лучшая редкость</span><strong>{RARITY_LABEL[stats.bestRarity]}</strong></div>
              <div className="card"><span>Рекламы</span><strong>{stats.adsWatched}</strong></div>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn secondary"
                onClick={() => void bridgeRef.current?.send("VKWebAppShare", { link: VK_APP_URL })}
              >
                Поделиться
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={resetProgress}
              >
                Сбросить прогресс
              </button>
            </div>
            <div className="footer-legal">
              <Link href="/privacy/">Конфиденциальность</Link>
              <Link href="/terms/">Соглашение</Link>
            </div>
          </section>
        )}
      </div>

      <nav className="tabs" aria-label="Разделы">
        {(
          [
            ["water", "Заводь"],
            ["gear", "Снасти"],
            ["album", "Альбом"],
            ["quests", "Задания"],
            ["stats", "Итоги"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {catchPopup && (
        <div className="overlay catch-overlay" onClick={() => { if (!getAdPolicy().isBusy()) setCatchPopup(null); }}>
          <div className="overlay-card" onClick={(event) => event.stopPropagation()}>
            <div className="catch-icon">{getFish(catchPopup.fishId).icon}</div>
            <h3>Улов!</h3>
            <p>
              <strong>{getFish(catchPopup.fishId).name}</strong>
              <br />
              <span className={`rarity-dot rarity-${catchPopup.rarity}`} />
              {RARITY_LABEL[catchPopup.rarity]} · {catchPopup.weight} кг
              <br />
              Можно продать за {sellFishValue(catchPopup)}🪙
            </p>
            <button type="button" className="btn" onClick={() => { if (!getAdPolicy().isBusy()) setCatchPopup(null); }}>
              В садок
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="overlay" onClick={() => { if (!getAdPolicy().isBusy()) setMessage(null); }}>
          <div className="overlay-card" onClick={(event) => event.stopPropagation()}>
            <h3>Омут</h3>
            <p>{message}</p>
            <button type="button" className="btn" onClick={() => { if (!getAdPolicy().isBusy()) setMessage(null); }}>
              Понятно
            </button>
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
}
