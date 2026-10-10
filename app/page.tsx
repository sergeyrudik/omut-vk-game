"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import { createVkBridge, readStoredValue, writeStoredValue } from "./vk-runtime";
import Link from "next/link";
import {
  BAIT_DATA,
  FISH_CATALOG,
  LOCATION_DATA,
  RARITY_LABEL,
  UPGRADE_DATA,
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
const INTERSTITIAL_INTERVAL_MS = 3 * 60 * 1000;
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
  const [rewards, setRewards] = useState<RewardLimits>(createDefaultSave().rewards);
  const [nextFishUid, setNextFishUid] = useState(1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [castPos, setCastPos] = useState(0);
  const [holding, setHolding] = useState(false);
  const [fight, setFight] = useState(() => createFightState({ rod: 0, line: 0, keepnet: 0 }));
  const [lastResult, setLastResult] = useState<string | null>(null);

  const bridgeRef = useRef<VKBridge | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastInterstitialRef = useRef(0);
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
    if (tutorialStep === 1) return "Дождись поклёвки, затем удерживай кнопку, чтобы леска не порвалась.";
    return "Продай рыбу или оставь в альбоме. Улучшай снасти на вкладке «Снасти».";
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
    setRewards(refreshRewards(save.rewards));
    setNextFishUid(save.nextFishUid);
  }, []);

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
      const localSave = migrateSave(readStoredValue(SAVE_KEY));
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
      applySave(selectNewestSave(localSave, cloudSave) ?? createDefaultSave());
      setHydrated(true);
      trackEvent("app_open");
      void checkRewardAvailability();
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applySave, checkRewardAvailability, trackEvent]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const save: GameSave = {
        version: 1,
        updatedAt: Date.now(),
        coins,
        pearls,
        bait,
        selectedBait,
        location,
        upgrades,
        keepnet,
        album,
        sound,
        tutorialDone,
        tutorialStep,
        stats,
        daily,
        rewards,
        nextFishUid,
      };
      const value = serializeSave(save);
      try {
        writeStoredValue(SAVE_KEY, value);
      } catch {
        trackEvent("save_write_error", { source: "local" });
      }
      if (bridgeRef.current) {
        void bridgeRef.current
          .send("VKWebAppStorageSet", { key: VK_SAVE_KEY, value })
          .catch(() => trackEvent("save_write_error", { source: "vk" }));
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    coins,
    pearls,
    bait,
    selectedBait,
    location,
    upgrades,
    keepnet,
    album,
    sound,
    tutorialDone,
    tutorialStep,
    stats,
    daily,
    rewards,
    nextFishUid,
    trackEvent,
  ]);

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
    fightRef.current = fight;
  }, [fight]);

  useEffect(() => {
    if (phase !== "casting" || paused) return;
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
  }, [phase, paused]);

  const finishEscape = useCallback(() => {
    setStats((prev) => ({ ...prev, escapes: prev.escapes + 1 }));
    setLastResult("Рыба сорвалась");
    pendingCatchRef.current = null;
    setPhase("idle");
    playSound("error");
  }, [playSound]);

  const finishCatch = useCallback(
    (fish: CaughtFish) => {
      setKeepnet((prev) => {
        if (prev.length >= getKeepnetCapacity(upgrades)) {
          setMessage("Садок полон — продай часть улова");
          return prev;
        }
        return [...prev, fish];
      });
      setAlbum((prev) => ({ ...prev, [fish.fishId]: (prev[fish.fishId] ?? 0) + 1 }));
      setStats((prev) => ({
        ...prev,
        catches: prev.catches + 1,
        bestRarity: betterRarity(prev.bestRarity, fish.rarity),
        locationsUnlocked: getUnlockedLocations(prev.catches + 1).length,
      }));
      setDaily((prev) => {
        const fresh = refreshDaily(prev);
        return { ...fresh, catch: fresh.catch + 1 };
      });
      setLastResult(`${getFish(fish.fishId).icon} ${getFish(fish.fishId).name} · ${fish.weight} кг`);
      setCatchPopup(fish);
      setSplash(true);
      window.setTimeout(() => setSplash(false), 450);
      pendingCatchRef.current = null;
      setPhase("idle");
      if (!tutorialDone) {
        setTutorialStep((step) => Math.min(2, step + 1));
        if (tutorialStep >= 1) setTutorialDone(true);
      }
      playSound("catch");
      void bridgeRef.current
        ?.send("VKWebAppTapticNotificationOccurred", { type: "success" })
        .catch(() => undefined);
      trackEvent("fish_caught", { id: fish.fishId, rarity: fish.rarity });
    },
    [playSound, trackEvent, tutorialDone, tutorialStep, upgrades],
  );

  useEffect(() => {
    if (phase !== "fighting" || paused) return;
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
  }, [finishCatch, finishEscape, phase, paused]);

  const maybeShowInterstitial = useCallback(async () => {
    if (!bridgeRef.current) return;
    const now = Date.now();
    if (now - lastInterstitialRef.current < INTERSTITIAL_INTERVAL_MS) return;
    try {
      const check = (await bridgeRef.current.send("VKWebAppCheckNativeAds", {
        ad_format: "interstitial",
      })) as { result?: boolean };
      if (!check.result) return;
      await bridgeRef.current.send("VKWebAppShowNativeAds", { ad_format: "interstitial" });
      lastInterstitialRef.current = now;
    } catch {
      // optional
    }
  }, []);

  const startCast = () => {
    if (phase !== "idle" || paused) return;
    if ((bait[selectedBait] ?? 0) <= 0) {
      setMessage("Нет наживки — купи на снастях или посмотри рекламу");
      return;
    }
    if (keepnet.length >= capacity) {
      setMessage("Садок полон");
      return;
    }
    setCastPos(0);
    castDir.current = 1;
    setPhase("casting");
    setLastResult(null);
    playSound("tap");
  };

  const lockCast = () => {
    if (phase !== "casting") return;
    if (castRaf.current) window.cancelAnimationFrame(castRaf.current);
    const quality = evaluateCast(castPos);
    setBait((prev) => ({ ...prev, [selectedBait]: Math.max(0, prev[selectedBait] - 1) }));
    setStats((prev) => ({ ...prev, casts: prev.casts + 1 }));
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, cast: fresh.cast + 1 };
    });
    if (!tutorialDone && tutorialStep === 0) setTutorialStep(1);

    const cast = resolveCast(quality, location, upgrades, selectedBait);
    playSound("cast");
    if (quality === "miss") {
      setLastResult("Мимо — наживка ушла");
      setPhase("idle");
      playSound("error");
      return;
    }

    const fish = rollCatch(location, upgrades, selectedBait, quality, nextFishUid);
    setNextFishUid((value) => value + 1);
    pendingCatchRef.current = fish;
    setPhase("waiting");
    setLastResult(quality === "perfect" ? "Идеальный заброс!" : "Заброс удался");
    biteTimeout.current = window.setTimeout(() => {
      setFight(createFightState(upgrades));
      setPhase("fighting");
      setHolding(false);
      if (!tutorialDone && tutorialStep === 1) setTutorialStep(2);
    }, cast.biteDelayMs);
  };

  useEffect(() => {
    return () => {
      if (biteTimeout.current) window.clearTimeout(biteTimeout.current);
    };
  }, []);

  const buyUpgrade = (key: UpgradeKey) => {
    const cost = getUpgradeCost(upgrades[key]);
    if (pearls < cost) {
      setMessage("Не хватает жемчуга");
      return;
    }
    setPearls((value) => value - cost);
    setUpgrades((prev) => ({ ...prev, [key]: prev[key] + 1 }));
    trackEvent("upgrade_buy", { key });
  };

  const claimQuest = (id: string) => {
    const quest = DAILY_QUESTS.find((item) => item.id === id);
    if (!quest) return;
    const fresh = refreshDaily(daily);
    if (fresh.claimed.includes(id) || fresh[quest.field] < quest.target) return;
    setDaily({ ...fresh, claimed: [...fresh.claimed, id] });
    if (quest.reward.coins) setCoins((value) => value + quest.reward.coins!);
    if (quest.reward.pearls) setPearls((value) => value + quest.reward.pearls!);
  };

  const watchRewardAd = async () => {
    if (!bridgeRef.current || !adAvailable) {
      setMessage("Реклама пока недоступна");
      void checkRewardAvailability();
      return;
    }
    const fresh = refreshRewards(rewards);
    const now = Date.now();
    if (fresh.count >= REWARD_DAILY_LIMIT) {
      setMessage("Дневной лимит наград исчерпан");
      return;
    }
    if (now - fresh.lastRewardAt < REWARD_COOLDOWN_MS) {
      setMessage("Подождите немного");
      return;
    }
    if (bridgeRef.current && adAvailable) {
      try {
        const response = (await bridgeRef.current.send("VKWebAppShowNativeAds", {
          ad_format: "reward",
        })) as { result?: boolean };
        if (response.result !== true) {
          setMessage("Реклама недоступна");
          return;
        }
      } catch {
        setMessage("Не удалось показать рекламу");
        return;
      }
    }
    setRewards({ date: fresh.date, count: fresh.count + 1, lastRewardAt: now });
    setStats((prev) => ({ ...prev, adsWatched: prev.adsWatched + 1 }));
    setBait((prev) => grantBaitPack(prev, REWARD_BAIT));
    setMessage(`+${REWARD_BAIT} червяков`);
    void checkRewardAvailability();
  };

  const sellOne = (uid: number) => {
    const result = sellKeepnetFish(keepnet, uid);
    if (!result.coins) return;
    setKeepnet(result.keepnet);
    setCoins((value) => value + result.coins);
    setStats((prev) => ({ ...prev, coinsEarned: prev.coinsEarned + result.coins }));
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, sell: fresh.sell + 1 };
    });
    void maybeShowInterstitial();
  };

  const sellAll = () => {
    const count = keepnet.length;
    const result = sellAllKeepnet(keepnet);
    if (!result.coins) return;
    setKeepnet([]);
    setCoins((value) => value + result.coins);
    setStats((prev) => ({ ...prev, coinsEarned: prev.coinsEarned + result.coins }));
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, sell: fresh.sell + count };
    });
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

  return (
    <div className="app-shell">
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
              <button type="button" className="btn secondary" onClick={() => setSound((value) => !value)}>
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
                  onClick={() => setLocation(loc.id)}
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
                  onClick={() => setSelectedBait(id)}
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
                  onClick={() => {
                    const recovered = gatherEmergencyBait(bait, coins, keepnet);
                    if (!recovered) return;
                    setBait(recovered);
                    setSelectedBait("worm");
                    setMessage("Нашёл одного червяка — можно снова рыбачить");
                  }}
                >
                  Собрать наживку · +1 червяк
                </button>
              )}
              <button type="button" className="btn secondary" onClick={() => void watchRewardAd()}>
                +{REWARD_BAIT} наживки за рекламу
              </button>
            </div>

            {keepnet.length > 0 && (
              <div className="list" style={{ marginTop: 12 }}>
                {keepnet.map((fish) => {
                  const def = getFish(fish.fishId);
                  const price = sellFishValue(fish);
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
                      <button type="button" className="btn secondary" onClick={() => sellOne(fish.uid)}>
                        Продать
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="btn" onClick={sellAll}>
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
                    <button type="button" className="btn" onClick={() => buyUpgrade(key)}>
                      💎 {cost}
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
                    onClick={() => {
                      const result = buyBait(bait, coins, id, 5);
                      if (!result.ok) {
                        setMessage("Не хватает монет");
                        return;
                      }
                      setBait(result.bait);
                      setCoins(result.coins);
                    }}
                  >
                    Купить
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
                onClick={() => {
                  applySave(createDefaultSave());
                  setStarted(false);
                  setPhase("idle");
                  setMessage("Прогресс сброшен");
                }}
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
        <div className="overlay catch-overlay" onClick={() => setCatchPopup(null)}>
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
            <button type="button" className="btn" onClick={() => setCatchPopup(null)}>
              В садок
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="overlay" onClick={() => setMessage(null)}>
          <div className="overlay-card" onClick={(event) => event.stopPropagation()}>
            <h3>Омут</h3>
            <p>{message}</p>
            <button type="button" className="btn" onClick={() => setMessage(null)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
