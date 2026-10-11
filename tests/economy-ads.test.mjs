import assert from "node:assert/strict";
import test from "node:test";
import { createAdPolicy } from "../app/ad-policy.ts";
import { attemptEconomyInterstitial, requestEconomyReward } from "../app/economy-ads.ts";

function setup() {
  let time = 1_000_000;
  const busy = [];
  const policy = createAdPolicy({ storageKey: "test", storage: null, now: () => time });
  return { policy, busy, now: () => time, advance: (ms) => { time += ms; } };
}
function rewardOptions(clock, overrides = {}) {
  return { policy: clock.policy, send: async () => ({ result: true }), available: true,
    count: 0, lastRewardAt: 0, dailyLimit: 8, cooldownMs: 180_000, rewardValue: 8,
    now: clock.now, onBusyChange: (value) => clock.busy.push(value), onGranted: () => {}, ...overrides };
}
test("reward starts its benefit and shared cooldown after a long successful video", async () => {
  const clock = setup(); const grants = []; let ads = 0;
  const outcome = await requestEconomyReward(rewardOptions(clock, {
    send: async (method, params) => { assert.equal(method, "VKWebAppShowNativeAds"); assert.equal(params.ad_format, "reward"); ads++; clock.advance(61_000); return { result: true }; },
    onGranted: (at, value) => grants.push({ at, value }),
  }));
  assert.equal(outcome, "granted"); assert.deepEqual(grants, [{ at: clock.now(), value: 8 }]);
  assert.deepEqual(clock.busy, [true, false]); assert.equal(clock.policy.isBusy(), false);
  assert.equal(clock.policy.rewardWaitMs(), 180_000);
  assert.equal(await requestEconomyReward(rewardOptions(clock)), "wait"); assert.equal(ads, 1);
});
for (const response of [undefined, {}, { result: false }, { result: "true" }, true]) {
  test(`invalid reward result ${JSON.stringify(response)} never grants resources`, async () => {
    const clock = setup(); let grants = 0;
    assert.equal(await requestEconomyReward(rewardOptions(clock, { send: async () => response, onGranted: () => grants++ })), "unavailable");
    assert.equal(grants, 0); assert.equal(clock.policy.rewardWaitMs(), 0); assert.equal(clock.policy.isBusy(), false);
    assert.deepEqual(clock.busy, [true, false]);
  });
}
test("rejected SDK call releases controls and never grants reward", async () => {
  const clock = setup(); let grants = 0;
  assert.equal(await requestEconomyReward(rewardOptions(clock, { send: async () => { throw new Error("cancel"); }, onGranted: () => grants++ })), "unavailable");
  assert.equal(grants, 0); assert.equal(clock.policy.isBusy(), false); assert.deepEqual(clock.busy, [true, false]);
});
test("zero value, missing inventory, daily cap, and cooldown decline before showing an ad", async () => {
  for (const [changes, expected] of [[{ rewardValue: 0 }, "no-value"], [{ available: false }, "unavailable"], [{ count: 8 }, "daily-limit"], [{ lastRewardAt: 999_999 }, "wait"]]) {
    const clock = setup(); let calls = 0;
    assert.equal(await requestEconomyReward(rewardOptions(clock, { ...changes, send: async () => { calls++; return { result: true }; } })), expected);
    assert.equal(calls, 0); assert.deepEqual(clock.busy, []); assert.equal(clock.policy.isBusy(), false);
  }
});
test("parallel reward click cannot request a second video or duplicate the grant", async () => {
  const clock = setup(); let resolveVideo; let grants = 0; let calls = 0;
  const options = rewardOptions(clock, { send: () => { calls++; return new Promise((resolve) => { resolveVideo = resolve; }); }, onGranted: () => grants++ });
  const first = requestEconomyReward(options);
  assert.equal(await requestEconomyReward(options), "wait"); assert.equal(calls, 1);
  resolveVideo({ result: true }); assert.equal(await first, "granted"); assert.equal(grants, 1);
});
for (const [game, boundary] of [["gorn", "craft-finished"], ["lavka", "upgrade-bought"], ["lavka", "goods-unlocked"], ["omut", "sale-one"], ["omut", "sale-all"]]) {
  test(`${game} ${boundary} only invokes auto ads at an idle unpaused boundary after grace`, async () => {
    const clock = setup(); let calls = 0;
    const context = { ready: true, paused: false, phase: "idle", send: async () => { calls++; return { result: true }; } };
    clock.policy.startGameplay();
    assert.equal(await attemptEconomyInterstitial(clock.policy, game, boundary, context), false); assert.equal(calls, 0);
    clock.advance(180_000);
    for (const phase of ["casting", "waiting", "fighting", "result"]) assert.equal(await attemptEconomyInterstitial(clock.policy, game, boundary, { ...context, phase }), false);
    assert.equal(await attemptEconomyInterstitial(clock.policy, game, boundary, { ...context, paused: true }), false);
    assert.equal(calls, 0);
    assert.equal(await attemptEconomyInterstitial(clock.policy, game, boundary, context), true); assert.equal(calls, 2);
    assert.equal(await attemptEconomyInterstitial(clock.policy, game, boundary, context), false); assert.equal(calls, 2);
  });
}
test("wrong game boundaries and missing native bridge never issue auto SDK requests", async () => {
  const clock = setup(); clock.policy.startGameplay(); clock.advance(180_000); let calls = 0;
  const context = { ready: true, paused: false, phase: "idle", send: async () => { calls++; return { result: true }; } };
  assert.equal(await attemptEconomyInterstitial(clock.policy, "gorn", "sale-all", context), false);
  assert.equal(await attemptEconomyInterstitial(clock.policy, "lavka", "craft-finished", context), false);
  assert.equal(await attemptEconomyInterstitial(clock.policy, "omut", "goods-unlocked", context), false);
  assert.equal(await attemptEconomyInterstitial(clock.policy, "omut", "sale-all", { ...context, ready: false }), false);
  assert.equal(calls, 0);
});
test("a rewarded video suppresses an otherwise eligible immediate sale interstitial", async () => {
  const clock = setup(); clock.policy.startGameplay(); clock.advance(180_000);
  assert.equal(await requestEconomyReward(rewardOptions(clock)), "granted"); let calls = 0;
  const context = { ready: true, paused: false, phase: "idle", send: async () => { calls++; return { result: true }; } };
  assert.equal(await attemptEconomyInterstitial(clock.policy, "omut", "sale-all", context), false); assert.equal(calls, 0);
  clock.advance(180_000); assert.equal(await attemptEconomyInterstitial(clock.policy, "omut", "sale-all", context), true); assert.equal(calls, 2);
});
