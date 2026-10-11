import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const adjacentRoot = path.resolve(import.meta.dirname, "..");
const gameRoot = process.env.OMUT_SOURCE_ROOT || (fs.existsSync(path.join(adjacentRoot, "package.json")) ? adjacentRoot : path.resolve(import.meta.dirname, "../monetization-2026-10-11/source/omut-vk-game"));
const ts = createRequire(path.join(gameRoot, "package.json"))("typescript");
const engine = await import(pathToFileURL(path.join(gameRoot, "app/game-engine.ts")));
const source = ts.createSourceFile("page.tsx", fs.readFileSync(path.join(gameRoot, "app/page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name, scope) {
  let arrow;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) arrow = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    if (name === "reset-button" && ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "button" && node.children.some(c => ts.isJsxText(c) && c.text.includes("Сбросить прогресс"))) {
      const attr = node.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === "onClick");
      arrow = attr?.initializer?.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow && ts.isArrowFunction(arrow), `actual ${name}`);
  const code = ts.transpileModule(`const invoke=${arrow.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn invoke;`)(...Object.values(scope));
}
function fixture() {
  const save = engine.createDefaultSave(); const state = { ...save, phase: "casting", started: true, holding: true, catchPopup: { fishId: "roach" }, message: null, lastResult: "old", splash: true };
  const tasks = new Map(); let nextId = 1; const cancelled = [];
  const noop = () => {};
  const scope = { ...engine, ...save, phase: "casting", paused: false, selectedBait: "worm", location: "backwater", castPos: 0.5, tutorialDone: true, tutorialStep: 2,
    getAdPolicy: () => ({ isBusy: () => false, startGameplay: noop }), castRaf: { current: 101 }, fightRaf: { current: 102 },
    biteTimeout: { current: null }, pendingCatchRef: { current: null }, holdingRef: { current: true }, fightRef: { current: engine.createFightState(save.upgrades) },
    castDir: { current: -1 }, playSound: noop, playSoundRef: { current: noop },
    window: { setTimeout: (fn) => { const id = nextId++; tasks.set(id, fn); return id; }, clearTimeout: (id) => tasks.delete(id), cancelAnimationFrame: (id) => cancelled.push(id) },
    applySave: (next) => Object.assign(state, next),
  };
  for (const key of ["Phase", "Tab", "Started", "Holding", "CatchPopup", "Message", "LastResult", "Splash", "CastPos", "Fight", "Bait", "Stats", "Daily", "NextFishUid", "TutorialStep"]) scope[`set${key}`] = (value) => { const k = key[0].toLowerCase() + key.slice(1); state[k] = typeof value === "function" ? value(state[k]) : value; };
  scope.saveRef = { current: state }; scope.resetPendingRef = { current: false }; scope.castPendingRef = { current: false }; scope.fishingGenerationRef = { current: 0 };
  scope.commitSave = async transform => { const previous = structuredClone(state); const next = transform(previous); if (next) scope.applySave(next); return { previous, external: next ?? previous, value: next ? "stored" : null }; };
  scope.synchronizeSave = () => state;
  // Future reset helper is evaluated only if production declares it; no copied implementation.
  if (source.text.includes("const cancelFishing =")) scope.cancelFishing = actual("cancelFishing", scope);
  if (source.text.includes("const resetProgress =")) scope.resetProgress = actual("resetProgress", scope);
  return { scope, state, tasks, cancelled, runRemaining: () => { for (const [id, fn] of [...tasks]) { tasks.delete(id); fn(); } }, lock: () => actual("lockCast", scope)(), reset: () => source.text.includes("const resetProgress =") ? actual("resetProgress", scope)() : actual("reset-button", scope)() };
}
test("reset during a pending bite cancels the actual callback and cannot resurrect old fishing", async () => {
  const f = fixture(); await f.lock(); assert.equal(f.state.phase, "waiting"); assert.equal(f.tasks.size, 1); assert.ok(f.scope.pendingCatchRef.current);
  await f.reset(); assert.equal(f.state.phase, "idle"); assert.equal(f.state.started, false);
  f.runRemaining(); assert.equal(f.state.phase, "idle", "pending pre-reset bite must never change reset state to fighting");
  assert.equal(f.tasks.size, 0); assert.equal(f.scope.pendingCatchRef.current, null); assert.equal(f.scope.holdingRef.current, false);
  assert.equal(f.state.catchPopup, null); assert.equal(f.state.message, "Прогресс сброшен");
});
test("reset cancels casting/fight frames and clears transient result UI while restoring starter resources", async () => {
  const f = fixture(); f.state.coins = 999; await f.reset();
  assert.ok(f.cancelled.includes(101)); assert.ok(f.cancelled.includes(102));
  assert.equal(f.state.coins, 80); assert.equal(f.state.pearls, 2); assert.equal(f.state.bait.worm, 20);
  assert.equal(f.state.catchPopup, null); assert.equal(f.state.lastResult, null); assert.equal(f.state.holding, false); assert.equal(f.state.phase, "idle");
});

test("locking a cast with empty selected bait declines before fish selection, timers, or resource counters", async () => {
  const f = fixture(); const before = structuredClone(f.state.bait);
  f.state.selectedBait = "fly"; f.scope.castPos = 0.5; await f.lock();
  assert.equal(f.state.phase, "idle"); assert.equal(f.state.stats.casts, 0);
  assert.deepEqual(f.state.bait, before); assert.equal(f.tasks.size, 0);
  assert.equal(f.scope.pendingCatchRef.current, null);
});
