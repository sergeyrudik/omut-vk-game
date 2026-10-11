import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const adjacent = path.resolve(import.meta.dirname, "..");
const root = fs.existsSync(path.join(adjacent, "package.json")) ? adjacent : path.resolve(import.meta.dirname, "../monetization-2026-10-11/source", `${process.env.GAME_SLUG}-vk-game`);
const game = JSON.parse(fs.readFileSync(path.join(root, "package.json"))).name.replace("-vk-game", "");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const engine = await import(pathToFileURL(path.join(root, "app/game-engine.ts")));
const { createAdPolicy } = await import(pathToFileURL(path.join(root, "app/ad-policy.ts")));
const { requestEconomyReward } = await import(pathToFileURL(path.join(root, "app/economy-ads.ts")));
const source = ts.createSourceFile("page.tsx", fs.readFileSync(path.join(root, "app/page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name, scope) {
  let arrow;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) arrow = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    if (name === "resetProgress" && !arrow && ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "button" && node.children.some(c => ts.isJsxText(c) && c.text.includes(game === "lavka" ? "Сбросить" : "Сбросить прогресс"))) {
      arrow = node.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === "onClick")?.initializer?.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow && ts.isArrowFunction(arrow), `production ${name}`);
  const code = ts.transpileModule(`const invoke = ${arrow.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn invoke;`)(...Object.values(scope));
}
function fixture(rewards) {
  const state = engine.createDefaultSave(); state.rewards = { ...rewards }; state.started = true;
  if (game === "lavka") state.coins = 700; if (game === "gorn") state.ingots = 700; if (game === "omut") state.coins = 700;
  const calls = []; const noop = () => {}; const policy = createAdPolicy({ storageKey: "quota", storage: null });
  policy.seedLastAdAt(state.rewards.lastRewardAt);
  const saveRef = { current: state };
  const scope = { ...engine, ...state, saveRef, paused: false, phase: "idle", catchPopup: null,
    getAdPolicy: () => policy, requestEconomyReward, vkReady: true, adAvailable: true, REWARD_DAILY_LIMIT: 8, REWARD_COOLDOWN_MS: 180000, REWARD_BAIT: 8, AD_COINS: 40, BOOST_MINUTES: 1, BOOST_MULT: 2,
    bridgeRef: { current: { send: async method => { calls.push(method); return { result: true }; } } },
    applySave: next => { Object.assign(state, next); saveRef.current = state; policy.seedLastAdAt(next.rewards.lastRewardAt); },
    setSave: value => { Object.assign(state, typeof value === "function" ? value(state) : value); saveRef.current = state; },
    checkRewardAvailability: async () => {}, setMessage: noop, showToast: noop,
    biteTimeout: { current: null }, castRaf: { current: null }, fightRaf: { current: null }, pendingCatchRef: { current: null }, holdingRef: { current: false }, castDir: { current: 1 }, fightRef: { current: engine.createFightState?.(state.upgrades) },
    window: { clearTimeout: noop, cancelAnimationFrame: noop },
  };
  for (const k of ["rewards", "stats", "ingots", "coins", "bait", "started", "offlineBanner", "tab", "fight", "holding", "castPos", "phase", "catchPopup", "lastResult", "splash", "rewardBusy", "adBusy", "boost", "now", "nowTick"]) scope[`set${k[0].toUpperCase()}${k.slice(1)}`] = value => { state[k] = typeof value === "function" ? value(state[k]) : value; };
  if (game === "omut") scope.cancelFishing = actual("cancelFishing", scope);
  const render = () => { Object.assign(scope, state); saveRef.current = state; };
  return { state, calls, policy, reset: () => { render(); actual("resetProgress", scope)(); render(); }, reward: () => { render(); return actual(game === "lavka" ? "watchReward" : "watchRewardAd", scope)(game === "gorn" ? "ingots" : "coins"); } };
}
test(`${game}: actual reset retains exhausted same-day quota and cannot show a ninth ad after cooldown`, async t => {
  const now = Date.UTC(2026, 9, 11, 12); t.mock.timers.enable({ apis: ["Date"], now });
  const rewards = { date: "2026-10-11", count: 8, lastRewardAt: now - 180001 };
  const f = fixture(rewards); f.reset(); t.mock.timers.tick(180001);
  await f.reward();
  assert.equal(f.calls.length, 0, "reset cannot reopen native SDK for ninth reward");
  assert.deepEqual(f.state.rewards, rewards);
  assert.equal(game === "gorn" ? f.state.ingots : f.state.coins, game === "omut" ? 80 : 0);
});
test(`${game}: actual reset retains partial quota and uses remaining slots only`, async t => {
  const now = Date.UTC(2026, 9, 11, 12); t.mock.timers.enable({ apis: ["Date"], now });
  const rewards = { date: "2026-10-11", count: 7, lastRewardAt: now - 180001 };
  const f = fixture(rewards); f.reset(); assert.deepEqual(f.state.rewards, rewards);
  await f.reward(); assert.equal(f.calls.length, 1); assert.equal(f.state.rewards.count, 8);
  t.mock.timers.tick(180001); await f.reward(); assert.equal(f.calls.length, 1); assert.equal(f.state.rewards.count, 8);
});
test(`${game}: actual reset refreshes an expired UTC quota while preserving recent ad protection`, async t => {
  const now = Date.UTC(2026, 9, 12, 0, 0, 1); t.mock.timers.enable({ apis: ["Date"], now });
  const rewards = { date: "2026-10-11", count: 8, lastRewardAt: now - 2000 };
  const f = fixture(rewards); f.reset();
  assert.deepEqual(f.state.rewards, { ...rewards, date: "2026-10-12", count: 0 });
  await f.reward(); assert.equal(f.calls.length, 0);
  t.mock.timers.tick(180001); await f.reward(); assert.equal(f.calls.length, 1); assert.equal(f.state.rewards.count, 1);
});
