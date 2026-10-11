export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type LocationId = "backwater" | "lake" | "night";
export type BaitId = "worm" | "bread" | "spinner" | "fly";
export type FishId =
  | "roach"
  | "perch"
  | "rudd"
  | "bleak"
  | "pike"
  | "bream"
  | "carp"
  | "tench"
  | "ide"
  | "chub"
  | "catfish"
  | "zander"
  | "asp"
  | "trout"
  | "grayling"
  | "eel"
  | "sterlet"
  | "burbot"
  | "crucian"
  | "silver"
  | "golden"
  | "king_pike"
  | "moon_carp"
  | "omut_spirit";

export type Upgrades = {
  rod: number;
  line: number;
  keepnet: number;
};

export type GameStats = {
  casts: number;
  catches: number;
  escapes: number;
  coinsEarned: number;
  adsWatched: number;
  bestRarity: Rarity;
  locationsUnlocked: number;
};

export type DailyProgress = {
  date: string;
  cast: number;
  catch: number;
  sell: number;
  claimed: string[];
};

export type RewardLimits = {
  date: string;
  count: number;
  lastRewardAt: number;
};

export type FishDef = {
  id: FishId;
  name: string;
  icon: string;
  rarity: Rarity;
  minWeight: number;
  maxWeight: number;
  value: number;
  locations: LocationId[];
};

export type CaughtFish = {
  uid: number;
  fishId: FishId;
  weight: number;
  rarity: Rarity;
  location: LocationId;
  caughtAt: number;
};

export type LocationDef = {
  id: LocationId;
  title: string;
  unlockCatches: number;
  biteMinMs: number;
  biteMaxMs: number;
};

export type CastQuality = "miss" | "ok" | "perfect";

export type CastResult = {
  quality: CastQuality;
  baitSpent: boolean;
  biteDelayMs: number;
};

export type FightTickResult = {
  tension: number;
  progress: number;
  status: "fighting" | "caught" | "escaped";
};

export type GameSave = {
  version: 1;
  updatedAt: number;
  coins: number;
  pearls: number;
  bait: Record<BaitId, number>;
  selectedBait: BaitId;
  location: LocationId;
  upgrades: Upgrades;
  keepnet: CaughtFish[];
  album: Partial<Record<FishId, number>>;
  sound: boolean;
  tutorialDone: boolean;
  tutorialStep: number;
  stats: GameStats;
  daily: DailyProgress;
  rewards: RewardLimits;
  nextFishUid: number;
};

export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Обычная",
  uncommon: "Необычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

export const BAIT_DATA: Record<BaitId, { title: string; icon: string; rarityBonus: number; cost: number }> = {
  worm: { title: "Червяк", icon: "🪱", rarityBonus: 0, cost: 5 },
  bread: { title: "Хлеб", icon: "🍞", rarityBonus: 0.02, cost: 8 },
  spinner: { title: "Блесна", icon: "🎣", rarityBonus: 0.06, cost: 18 },
  fly: { title: "Мушка", icon: "🪰", rarityBonus: 0.1, cost: 28 },
};

export const LOCATION_DATA: LocationDef[] = [
  { id: "backwater", title: "Заводь", unlockCatches: 0, biteMinMs: 1800, biteMaxMs: 4200 },
  { id: "lake", title: "Озеро", unlockCatches: 12, biteMinMs: 1500, biteMaxMs: 3800 },
  { id: "night", title: "Ночной плёс", unlockCatches: 35, biteMinMs: 1200, biteMaxMs: 3200 },
];

export const UPGRADE_DATA: Record<
  keyof Upgrades,
  { icon: string; title: string; description: string; bonus: (level: number) => string }
> = {
  rod: {
    icon: "🎣",
    title: "Удочка",
    description: "Повышает шанс редкой рыбы",
    bonus: (level) => `+${level * 4}% к редкости`,
  },
  line: {
    icon: "🧵",
    title: "Леска",
    description: "Шире окно вываживания",
    bonus: (level) => `окно +${level * 4}%`,
  },
  keepnet: {
    icon: "🧺",
    title: "Садок",
    description: "Больше места для улова",
    bonus: (level) => `${8 + level * 2} мест`,
  },
};

export const FISH_CATALOG: FishDef[] = [
  { id: "roach", name: "Плотва", icon: "🐟", rarity: "common", minWeight: 0.2, maxWeight: 0.6, value: 12, locations: ["backwater", "lake"] },
  { id: "perch", name: "Окунь", icon: "🐠", rarity: "common", minWeight: 0.3, maxWeight: 0.9, value: 14, locations: ["backwater", "lake", "night"] },
  { id: "rudd", name: "Краснопёрка", icon: "🐟", rarity: "common", minWeight: 0.2, maxWeight: 0.5, value: 11, locations: ["backwater"] },
  { id: "bleak", name: "Уклейка", icon: "🐟", rarity: "common", minWeight: 0.05, maxWeight: 0.15, value: 8, locations: ["backwater", "lake"] },
  { id: "crucian", name: "Карась", icon: "🐡", rarity: "common", minWeight: 0.4, maxWeight: 1.2, value: 16, locations: ["backwater", "lake"] },
  { id: "bream", name: "Лещ", icon: "🐟", rarity: "uncommon", minWeight: 0.8, maxWeight: 2.2, value: 28, locations: ["lake", "night"] },
  { id: "carp", name: "Карп", icon: "🐡", rarity: "uncommon", minWeight: 1.0, maxWeight: 3.5, value: 34, locations: ["lake"] },
  { id: "tench", name: "Линь", icon: "🐟", rarity: "uncommon", minWeight: 0.6, maxWeight: 1.8, value: 30, locations: ["backwater", "lake"] },
  { id: "ide", name: "Язь", icon: "🐠", rarity: "uncommon", minWeight: 0.7, maxWeight: 2.0, value: 32, locations: ["lake", "night"] },
  { id: "chub", name: "Голавль", icon: "🐠", rarity: "uncommon", minWeight: 0.5, maxWeight: 1.6, value: 29, locations: ["backwater", "night"] },
  { id: "pike", name: "Щука", icon: "🦈", rarity: "rare", minWeight: 1.5, maxWeight: 5.0, value: 55, locations: ["backwater", "lake", "night"] },
  { id: "zander", name: "Судак", icon: "🦈", rarity: "rare", minWeight: 1.2, maxWeight: 4.0, value: 58, locations: ["lake", "night"] },
  { id: "asp", name: "Жерех", icon: "🐠", rarity: "rare", minWeight: 1.0, maxWeight: 3.5, value: 52, locations: ["lake"] },
  { id: "catfish", name: "Сом", icon: "🐡", rarity: "rare", minWeight: 2.0, maxWeight: 8.0, value: 70, locations: ["night"] },
  { id: "trout", name: "Форель", icon: "🐟", rarity: "rare", minWeight: 0.8, maxWeight: 2.5, value: 62, locations: ["night"] },
  { id: "grayling", name: "Хариус", icon: "🐠", rarity: "epic", minWeight: 0.6, maxWeight: 1.8, value: 95, locations: ["night"] },
  { id: "eel", name: "Угорь", icon: "🐍", rarity: "epic", minWeight: 1.0, maxWeight: 3.0, value: 110, locations: ["night"] },
  { id: "sterlet", name: "Стерлядь", icon: "🐟", rarity: "epic", minWeight: 1.2, maxWeight: 4.0, value: 130, locations: ["lake", "night"] },
  { id: "burbot", name: "Налим", icon: "🐡", rarity: "epic", minWeight: 1.5, maxWeight: 4.5, value: 120, locations: ["night"] },
  { id: "silver", name: "Серебряный карась", icon: "✨", rarity: "epic", minWeight: 0.9, maxWeight: 2.2, value: 140, locations: ["lake"] },
  { id: "golden", name: "Золотая плотва", icon: "🥇", rarity: "legendary", minWeight: 0.5, maxWeight: 1.2, value: 220, locations: ["backwater", "lake"] },
  { id: "king_pike", name: "Царь-щука", icon: "👑", rarity: "legendary", minWeight: 4.0, maxWeight: 12.0, value: 280, locations: ["lake", "night"] },
  { id: "moon_carp", name: "Лунный карп", icon: "🌙", rarity: "legendary", minWeight: 2.5, maxWeight: 7.0, value: 300, locations: ["night"] },
  { id: "omut_spirit", name: "Дух омута", icon: "👻", rarity: "legendary", minWeight: 1.0, maxWeight: 3.0, value: 360, locations: ["night"] },
];

function clampInt(value: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function getLocalDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function createDefaultUpgrades(): Upgrades {
  return { rod: 0, line: 0, keepnet: 0 };
}

export function createDefaultStats(): GameStats {
  return {
    casts: 0,
    catches: 0,
    escapes: 0,
    coinsEarned: 0,
    adsWatched: 0,
    bestRarity: "common",
    locationsUnlocked: 1,
  };
}

export function createDefaultDaily(date = getLocalDateKey()): DailyProgress {
  return { date, cast: 0, catch: 0, sell: 0, claimed: [] };
}

export function createDefaultRewards(date = getLocalDateKey()): RewardLimits {
  return { date, count: 0, lastRewardAt: 0 };
}

export function createDefaultBait(): Record<BaitId, number> {
  return { worm: 20, bread: 5, spinner: 2, fly: 0 };
}

export function createDefaultSave(): GameSave {
  return {
    version: 1,
    updatedAt: Date.now(),
    coins: 80,
    pearls: 2,
    bait: createDefaultBait(),
    selectedBait: "worm",
    location: "backwater",
    upgrades: createDefaultUpgrades(),
    keepnet: [],
    album: {},
    sound: true,
    tutorialDone: false,
    tutorialStep: 0,
    stats: createDefaultStats(),
    daily: createDefaultDaily(),
    rewards: createDefaultRewards(),
    nextFishUid: 1,
  };
}

export function serializeSave(save: GameSave): string {
  return JSON.stringify({ ...save, updatedAt: Date.now() });
}

export function selectNewestSave(a: GameSave | null, b: GameSave | null): GameSave | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function migrateSave(raw: string | null | undefined): GameSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GameSave>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = createDefaultSave();
    const bait = createDefaultBait();
    if (parsed.bait && typeof parsed.bait === "object") {
      for (const key of Object.keys(bait) as BaitId[]) {
        bait[key] = clampInt((parsed.bait as Record<string, unknown>)[key], bait[key], 0, 9999);
      }
    }
    const album: Partial<Record<FishId, number>> = {};
    if (parsed.album && typeof parsed.album === "object") {
      for (const [id, count] of Object.entries(parsed.album)) {
        if (FISH_CATALOG.some((fish) => fish.id === id)) {
          album[id as FishId] = clampInt(count, 0, 0, 9999);
        }
      }
    }
    const keepnet = Array.isArray(parsed.keepnet)
      ? parsed.keepnet
          .filter((item): item is CaughtFish => Boolean(item && typeof item === "object"))
          .map((item) => ({
            uid: clampInt(item.uid, 0),
            fishId: (FISH_CATALOG.some((f) => f.id === item.fishId) ? item.fishId : "roach") as FishId,
            weight: typeof item.weight === "number" && Number.isFinite(item.weight) ? item.weight : 0.5,
            rarity: (RARITY_ORDER.includes(item.rarity) ? item.rarity : "common") as Rarity,
            location: (["backwater", "lake", "night"].includes(item.location)
              ? item.location
              : "backwater") as LocationId,
            caughtAt: clampInt(item.caughtAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
          }))
      : [];

    return {
      version: 1,
      updatedAt: clampInt(parsed.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      coins: clampInt(parsed.coins, base.coins, 0, 999_999),
      pearls: clampInt(parsed.pearls, base.pearls, 0, 9999),
      bait,
      selectedBait: (parsed.selectedBait && parsed.selectedBait in BAIT_DATA
        ? parsed.selectedBait
        : "worm") as BaitId,
      location: (["backwater", "lake", "night"].includes(parsed.location as string)
        ? parsed.location
        : "backwater") as LocationId,
      upgrades: {
        rod: clampInt(parsed.upgrades?.rod, 0, 0, 20),
        line: clampInt(parsed.upgrades?.line, 0, 0, 20),
        keepnet: clampInt(parsed.upgrades?.keepnet, 0, 0, 20),
      },
      keepnet,
      album,
      sound: parsed.sound !== false,
      tutorialDone: Boolean(parsed.tutorialDone),
      tutorialStep: clampInt(parsed.tutorialStep, 0, 0, 2),
      stats: {
        casts: clampInt(parsed.stats?.casts, 0),
        catches: clampInt(parsed.stats?.catches, 0),
        escapes: clampInt(parsed.stats?.escapes, 0),
        coinsEarned: clampInt(parsed.stats?.coinsEarned, 0),
        adsWatched: clampInt(parsed.stats?.adsWatched, 0),
        bestRarity: (RARITY_ORDER.includes(parsed.stats?.bestRarity as Rarity)
          ? parsed.stats?.bestRarity
          : "common") as Rarity,
        locationsUnlocked: clampInt(parsed.stats?.locationsUnlocked, 1, 1, 3),
      },
      daily: {
        date: typeof parsed.daily?.date === "string" ? parsed.daily.date : getLocalDateKey(),
        cast: clampInt(parsed.daily?.cast, 0),
        catch: clampInt(parsed.daily?.catch, 0),
        sell: clampInt(parsed.daily?.sell, 0),
        claimed: Array.isArray(parsed.daily?.claimed)
          ? parsed.daily.claimed.filter((item): item is string => typeof item === "string")
          : [],
      },
      rewards: {
        date: typeof parsed.rewards?.date === "string" ? parsed.rewards.date : getLocalDateKey(),
        count: clampInt(parsed.rewards?.count, 0),
        lastRewardAt: clampInt(parsed.rewards?.lastRewardAt, 0, 0, Number.MAX_SAFE_INTEGER),
      },
      nextFishUid: clampInt(parsed.nextFishUid, 1, 1),
    };
  } catch {
    return null;
  }
}

export function getUpgradeCost(level: number): number {
  return 3 + clampInt(level, 0, 0, 50) * 2;
}

export function getKeepnetCapacity(upgrades: Upgrades): number {
  return 8 + upgrades.keepnet * 2;
}

export function getFightWindow(upgrades: Upgrades): { min: number; max: number } {
  const widen = upgrades.line * 0.04;
  return {
    min: Math.max(0.22, 0.34 - widen / 2),
    max: Math.min(0.78, 0.58 + widen / 2),
  };
}

export function getUnlockedLocations(catches: number): LocationId[] {
  return LOCATION_DATA.filter((loc) => catches >= loc.unlockCatches).map((loc) => loc.id);
}

export function getLocation(id: LocationId): LocationDef {
  return LOCATION_DATA.find((loc) => loc.id === id) ?? LOCATION_DATA[0];
}

export function getFish(id: FishId): FishDef {
  return FISH_CATALOG.find((fish) => fish.id === id) ?? FISH_CATALOG[0];
}

export function evaluateCast(meterPosition: number): CastQuality {
  const pos = Math.min(1, Math.max(0, meterPosition));
  if (pos >= 0.42 && pos <= 0.58) return "perfect";
  if (pos >= 0.28 && pos <= 0.72) return "ok";
  return "miss";
}

export function resolveCast(
  quality: CastQuality,
  location: LocationId,
  upgrades: Upgrades,
  bait: BaitId,
  rng = Math.random,
): CastResult {
  const loc = getLocation(location);
  if (quality === "miss") {
    return { quality, baitSpent: true, biteDelayMs: 0 };
  }
  const baitBonus = BAIT_DATA[bait].rarityBonus;
  const speed = 1 + upgrades.rod * 0.03 + baitBonus;
  const span = loc.biteMaxMs - loc.biteMinMs;
  const biteDelayMs = Math.round(loc.biteMinMs + span * (1 - Math.min(0.85, rng() * speed)));
  return { quality, baitSpent: true, biteDelayMs: Math.max(900, biteDelayMs) };
}

function pickRarity(upgrades: Upgrades, bait: BaitId, castQuality: CastQuality, rng: () => number): Rarity {
  const bonus = upgrades.rod * 0.04 + BAIT_DATA[bait].rarityBonus + (castQuality === "perfect" ? 0.08 : 0);
  const roll = rng();
  if (roll < 0.01 + bonus * 0.15) return "legendary";
  if (roll < 0.05 + bonus * 0.35) return "epic";
  if (roll < 0.16 + bonus * 0.45) return "rare";
  if (roll < 0.4 + bonus * 0.35) return "uncommon";
  return "common";
}

export function rollCatch(
  location: LocationId,
  upgrades: Upgrades,
  bait: BaitId,
  castQuality: CastQuality,
  nextUid: number,
  rng = Math.random,
): CaughtFish | null {
  if (castQuality === "miss") return null;
  const rarity = pickRarity(upgrades, bait, castQuality, rng);
  const pool = FISH_CATALOG.filter((fish) => fish.locations.includes(location) && fish.rarity === rarity);
  const fallback = FISH_CATALOG.filter((fish) => fish.locations.includes(location));
  const list = pool.length > 0 ? pool : fallback;
  const def = list[Math.floor(rng() * list.length)];
  const weight = Number(
    (def.minWeight + rng() * (def.maxWeight - def.minWeight)).toFixed(2),
  );
  return {
    uid: nextUid,
    fishId: def.id,
    weight,
    rarity: def.rarity,
    location,
    caughtAt: Date.now(),
  };
}

export function createFightState(upgrades: Upgrades): {
  tension: number;
  progress: number;
  window: { min: number; max: number };
  drift: number;
} {
  const window = getFightWindow(upgrades);
  return {
    tension: 0.5,
    progress: 0,
    window,
    drift: 0.012 + Math.random() * 0.01,
  };
}

export function tickFight(
  state: { tension: number; progress: number; window: { min: number; max: number }; drift: number },
  holding: boolean,
  dt = 1,
): FightTickResult {
  let tension = state.tension + (holding ? -0.035 * dt : state.drift * dt);
  tension = Math.min(1, Math.max(0, tension));
  let progress = state.progress;
  const inWindow = tension >= state.window.min && tension <= state.window.max;
  if (inWindow) progress += 0.045 * dt;
  else progress -= 0.02 * dt;
  progress = Math.min(1, Math.max(0, progress));

  if (tension <= 0.02 || tension >= 0.98) {
    return { tension, progress, status: "escaped" };
  }
  if (progress >= 1) {
    return { tension, progress: 1, status: "caught" };
  }
  return { tension, progress, status: "fighting" };
}

export function sellFishValue(fish: CaughtFish): number {
  const def = getFish(fish.fishId);
  const weightFactor = fish.weight / ((def.minWeight + def.maxWeight) / 2);
  return Math.max(1, Math.round(def.value * weightFactor));
}

export function sellKeepnetFish(
  keepnet: CaughtFish[],
  uid: number,
): { keepnet: CaughtFish[]; coins: number } {
  const fish = keepnet.find((item) => item.uid === uid);
  if (!fish) return { keepnet, coins: 0 };
  return {
    keepnet: keepnet.filter((item) => item.uid !== uid),
    coins: sellFishValue(fish),
  };
}

export function sellAllKeepnet(keepnet: CaughtFish[]): { keepnet: CaughtFish[]; coins: number } {
  const coins = keepnet.reduce((sum, fish) => sum + sellFishValue(fish), 0);
  return { keepnet: [], coins };
}

export function albumProgress(album: Partial<Record<FishId, number>>): { caught: number; total: number } {
  const caught = FISH_CATALOG.filter((fish) => (album[fish.id] ?? 0) > 0).length;
  return { caught, total: FISH_CATALOG.length };
}

export function betterRarity(a: Rarity, b: Rarity): Rarity {
  return RARITY_ORDER.indexOf(a) >= RARITY_ORDER.indexOf(b) ? a : b;
}

export function refreshDaily(daily: DailyProgress, date = getLocalDateKey()): DailyProgress {
  if (daily.date === date) return daily;
  return createDefaultDaily(date);
}

export const BAIT_CAP = 9999;

export function rewardBaitAmount(bait: Record<BaitId, number>, requested = 8): number {
  return Math.min(requested, Math.max(0, BAIT_CAP - Math.floor(bait.worm)));
}

export function refreshRewards(rewards: RewardLimits, date = getLocalDateKey()): RewardLimits {
  if (rewards.date === date) return rewards;
  return { ...createDefaultRewards(date), lastRewardAt: rewards.lastRewardAt };
}

export function grantBaitPack(bait: Record<BaitId, number>, amount = 8): Record<BaitId, number> {
  return { ...bait, worm: Math.min(BAIT_CAP, bait.worm + Math.max(0, amount)) };
}

export function buyBait(
  bait: Record<BaitId, number>,
  coins: number,
  id: BaitId,
  count = 5,
): { bait: Record<BaitId, number>; coins: number; ok: boolean } {
  const cost = BAIT_DATA[id].cost * count;
  if (coins < cost) return { bait, coins, ok: false };
  return {
    bait: { ...bait, [id]: bait[id] + count },
    coins: coins - cost,
    ok: true,
  };
}

/** A player who exhausted all affordable bait can recover without ads or reset. */
export function gatherEmergencyBait(
  bait: Record<BaitId, number>,
  coins: number,
  keepnet: readonly CaughtFish[],
): Record<BaitId, number> | null {
  const cheapestPack = Math.min(...Object.values(BAIT_DATA).map((item) => item.cost)) * 5;
  if (Object.values(bait).some((count) => count > 0) || keepnet.length > 0 || coins >= cheapestPack) {
    return null;
  }
  return { ...bait, worm: 1 };
}
