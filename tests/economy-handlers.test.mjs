import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as engine from "../app/game-engine.ts";
import { createAdPolicy } from "../app/ad-policy.ts";
import { attemptEconomyInterstitial, requestEconomyReward } from "../app/economy-ads.ts";
const game = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).name.replace("-vk-game", "");
const source = ts.createSourceFile("page.tsx", fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name, scope) {
  let arrow;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) arrow = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow && ts.isArrowFunction(arrow), `production ${name}`);
  const code = ts.transpileModule(`const invoke = ${arrow.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn invoke;`)(...Object.values(scope));
}
function fixture(options = {}) {
  const { ready = true, delay = 0, onDelay = () => {} } = options;
  const response = "response" in options ? options.response : true;
  let clock = Date.now(); const initial = engine.createDefaultSave(); const state = structuredClone(initial); const events = []; const calls = [];
  const policy = createAdPolicy({ storageKey: "handler", storage: null, now: () => clock });
  const noop = () => {};
  const write = (key) => (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  const client = ready ? { send: async (method, params) => { calls.push([method, params?.ad_format]); if (delay) { clock += delay; onDelay(delay); } return { result: response }; } } : null;
  const saveRef = { current: structuredClone(state) };
  const scope = { ...engine, ...initial, ingots: initial.ingots, coins: initial.coins, bait: initial.bait,
    bridgeRef: { current: client }, vkReady: ready, adAvailable: ready, started: true, paused: false, phase: "idle", catchPopup: null, craftPopup: null,
    getAdPolicy: () => policy, attemptEconomyInterstitial,
    requestEconomyReward: (opts) => requestEconomyReward({ ...opts, now: () => clock }),
    saveRef, tutorialDone: true, tutorialStep: 2, tapStreak: 0, REWARD_DAILY_LIMIT: 8, REWARD_COOLDOWN_MS: 180_000, REWARD_BAIT: 8, AD_COINS: 40, BOOST_MINUTES: 1, BOOST_MULT: 2,
    setSave: (value) => { const next = typeof value === "function" ? value(state) : value; Object.assign(state, next); saveRef.current = structuredClone(next); },
    checkRewardAvailability: async () => {}, setMessage: (v) => events.push(v), showToast: (v) => events.push(v),
    playSound: noop, playTone: noop, haptic: noop, trackEvent: noop, addFloater: noop,
    window: { setTimeout: noop }, Date: { now: () => clock },
  };
  for (const key of ["Ingots","Coal","Upgrades","Crafted","Stats","Daily","Rewards","Boost","NowTick","Now","Message","CraftPopup","TapStreak","Heat","FloatText","FloatCrit","Hit","CritHit","Sparking","TutorialStep","TutorialDone","AdBusy","RewardBusy","Keepnet","Coins","Bait","TapPulse"]) scope[`set${key}`] = write(key[0].toLowerCase() + key.slice(1));
  scope.maybeShowInterstitial = (...args) => { events.push(["auto", ...args]); return actual("maybeShowInterstitial", scope)(...args); };
  return { state, scope, policy, events, calls, advance: (ms) => { clock += ms; },
    reward: (kind = game === "gorn" ? "ingots" : "coins") => actual(game === "lavka" ? "watchReward" : "watchRewardAd", scope)(kind),
    handler: (name, ...args) => actual(name, scope)(...args) };
}
for (const response of [true, false, "true", undefined]) {
  test(`${game}: real resource-reward handler grants only literal success (${response})`, async () => {
    const f = fixture({ response }); const before = game === "gorn" ? f.state.ingots : game === "lavka" ? f.state.coins : f.state.bait.worm;
    await f.reward();
    const after = game === "gorn" ? f.state.ingots : game === "lavka" ? f.state.coins : f.state.bait.worm;
    assert.equal(after - before, response === true ? game === "gorn" ? 100 : game === "lavka" ? 40 : 8 : 0);
    assert.equal(f.state.rewards.count, response === true ? 1 : 0); assert.equal(f.policy.isBusy(), false);
  });
}
test(`${game}: real handler declines full resource inventory before SDK`, async () => {
  const f = fixture();
  if (game === "gorn") f.scope.ingots = f.state.ingots = engine.INGOT_CAP;
  if (game === "lavka") f.state.coins = engine.COIN_CAP; f.scope.saveRef.current.coins = engine.COIN_CAP;
  if (game === "omut") f.scope.bait = f.state.bait = { ...f.state.bait, worm: engine.BAIT_CAP };
  await f.reward(); assert.equal(f.calls.length, 0); assert.equal(f.state.rewards.count, 0);
});
test(`${game}: real reward completes across midnight using new day's count and date`, async (t) => {
  // All three current engines use UTC calendar keys despite getLocalDateKey naming.
  const before = Date.UTC(2026, 9, 11, 23, 59, 59);
  t.mock.timers.enable({ apis: ["Date"], now: before });
  const f = fixture({ delay: 2000, onDelay: (ms) => t.mock.timers.tick(ms) });
  f.state.rewards.count = 7; f.scope.rewards = f.state.rewards; f.scope.saveRef.current.rewards = f.state.rewards;
  const oldDate = f.state.rewards.date;
  await f.reward(); assert.notEqual(f.state.rewards.date, oldDate); assert.equal(f.state.rewards.count, 1);
  assert.equal(engine.refreshRewards(f.state.rewards).count, 1);
  assert.equal(f.state.rewards.lastRewardAt, before + 2000);
});
if (game !== "omut") test(`${game}: real boost starts after video and keeps its full duration`, async (t) => {
  const before = 1_800_000_000_000;
  t.mock.timers.enable({ apis: ["Date"], now: before });
  const f = fixture({ delay: 61_000, onDelay: (ms) => t.mock.timers.tick(ms) });
  await f.reward("boost");
  const expiry = game === "gorn" ? f.state.boost.expiresAt : f.state.boost.until;
  assert.equal(expiry, before + 61_000 + 60_000);
  assert.equal(f.state.rewards.lastRewardAt, before + 61_000);
  assert.equal(f.policy.rewardWaitMs(), 180_000);
  assert.equal(f.state.rewards.count, 1);
});
if (game === "gorn") {
  test("gorn: crafting displays result without auto; closing it is the sole eligible boundary", async () => {
    const f = fixture(); f.scope.ingots = 100; f.scope.stats = { ...f.state.stats, taps: 100 };
    f.handler("craft", "knife"); assert.equal(f.calls.length, 0); assert.equal(f.events.filter(e => Array.isArray(e)).length, 0);
    assert.ok(f.state.craftPopup); f.scope.craftPopup = f.state.craftPopup;
    f.advance(180_000); f.handler("closeCraftPopup"); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.state.craftPopup, null); assert.equal(f.calls.filter(c => c[1] === "interstitial").length, 2);
  });
  test("gorn: pending ad prevents tapping, crafting, upgrades, and duplicate result closure", () => {
    const f = fixture(); f.policy.beginReward(); const before = structuredClone(f.state);
    f.handler("onTap"); f.handler("craft", "knife"); f.handler("buyUpgrade", "hammer"); f.scope.craftPopup = "knife"; f.handler("closeCraftPopup");
    assert.deepEqual(f.state, before); assert.equal(f.calls.length, 0);
  });
}
if (game === "lavka") {
  test("lavka: ordinary selling stays free; new good is a single milestone boundary", () => {
    const f = fixture(); f.handler("onSell"); assert.equal(f.events.filter(e => Array.isArray(e)).length, 0);
    f.state.stats.totalEarned = 79; f.state.goodsUnlocked = 1; f.scope.saveRef.current = structuredClone(f.state);
    f.handler("onSell"); assert.equal(f.state.goodsUnlocked, 2);
    assert.deepEqual(f.events.filter(e => Array.isArray(e)), [["auto", "goods-unlocked"]]);
  });
  test("lavka: failed upgrade never invokes auto; successful upgrade uses its own boundary", () => {
    const f = fixture(); f.handler("onUpgrade", "counter"); assert.equal(f.events.filter(e => Array.isArray(e)).length, 0);
    f.state.coins = 100; f.scope.saveRef.current = structuredClone(f.state); f.handler("onUpgrade", "counter"); assert.equal(f.state.upgrades.counter, 1);
    assert.deepEqual(f.events.filter(e => Array.isArray(e)), [["auto", "upgrade-bought"]]);
  });
  test("lavka: pending ad prevents both selling and upgrades", () => {
    const f = fixture(); f.policy.beginReward(); const before = structuredClone(f.state);
    f.handler("onSell"); f.handler("onUpgrade", "counter"); assert.deepEqual(f.state, before); assert.equal(f.calls.length, 0);
  });
}
if (game === "omut") {
  for (const name of ["sellOne", "sellAll"]) {
    test(`omut: ${name} is a sale boundary and cannot happen mid-cast/fight`, async () => {
      for (const phase of ["casting", "waiting", "fighting", "idle"]) {
        const f = fixture(); f.scope.phase = phase;
        const fish = engine.rollCatch("backwater", f.state.upgrades, "worm", "perfect", 1, () => 0.3);
        f.scope.keepnet = f.state.keepnet = [fish]; const coins = f.state.coins;
        f.policy.startGameplay(); f.advance(180_000); f.handler(name, fish.uid); await Promise.resolve(); await Promise.resolve();
        assert.equal(f.state.keepnet.length, phase === "idle" ? 0 : 1);
        assert.equal(f.state.coins > coins, phase === "idle");
        assert.equal(f.calls.filter(c => c[1] === "interstitial").length, phase === "idle" ? 2 : 0);
      }
    });
  }
  test("omut: reward cannot interrupt fishing or catch popup", async () => {
    for (const changes of [{ phase: "fighting" }, { phase: "casting" }, { catchPopup: {} }]) {
      const f = fixture(); Object.assign(f.scope, changes); await f.reward(); assert.equal(f.calls.length, 0); assert.equal(f.state.rewards.count, 0);
    }
  });
}
