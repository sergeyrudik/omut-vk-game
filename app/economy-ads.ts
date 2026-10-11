import type { createAdPolicy } from "./ad-policy";

type Policy = ReturnType<typeof createAdPolicy>;
type Game = "gorn" | "lavka" | "omut";
type Boundary = "craft-finished" | "sale-one" | "sale-all" | "upgrade-bought" | "goods-unlocked";
type Phase = "idle" | "casting" | "waiting" | "fighting" | "result";
type Send = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export async function attemptEconomyInterstitial(
  policy: Policy,
  game: Game,
  boundary: Boundary,
  context: { send: Send; ready: boolean; paused: boolean; phase: Phase },
): Promise<boolean> {
  const allowed: Record<Game, Boundary[]> = {
    gorn: ["craft-finished"],
    lavka: ["upgrade-bought", "goods-unlocked"],
    omut: ["sale-one", "sale-all"],
  };
  if (context.paused || context.phase !== "idle" || !allowed[game].includes(boundary)) return false;
  return policy.maybeInterstitial(context.send, context.ready);
}

export type RewardResult = "granted" | "unavailable" | "wait" | "daily-limit" | "no-value";

export async function requestEconomyReward(options: {
  policy: Policy;
  send: Send;
  available: boolean;
  count: number;
  lastRewardAt: number;
  dailyLimit: number;
  cooldownMs: number;
  rewardValue: number;
  now?: () => number;
  onBusyChange: (busy: boolean) => void;
  onGranted: (watchedAt: number, rewardValue: number) => void;
}): Promise<RewardResult> {
  const now = options.now ?? Date.now;
  if (!Number.isFinite(options.rewardValue) || options.rewardValue <= 0) return "no-value";
  if (!options.available) return "unavailable";
  if (options.count >= options.dailyLimit) return "daily-limit";
  if (now() - options.lastRewardAt < options.cooldownMs || !options.policy.beginReward()) return "wait";
  options.onBusyChange(true);
  try {
    const response = await options.send("VKWebAppShowNativeAds", { ad_format: "reward" });
    if (typeof response !== "object" || response === null || !("result" in response) || response.result !== true) return "unavailable";
    const watchedAt = now();
    options.policy.finishReward(true);
    options.onGranted(watchedAt, options.rewardValue);
    return "granted";
  } catch {
    return "unavailable";
  } finally {
    options.policy.finishReward(false);
    options.onBusyChange(false);
  }
}
