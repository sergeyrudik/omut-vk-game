import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as engine from "../app/game-engine.ts";

const source = ts.createSourceFile("page.tsx", fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
const variables = new Map();
function walk(node) {
  if (ts.isVariableDeclaration(node)) variables.set(node.name.getText(source), node.initializer);
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") effects.push(node.arguments[0]);
  ts.forEachChild(node, walk);
}
walk(source);
const castEffect = effects.find(node => node.getText(source).includes("setCastPos((prev)"));
const fightEffect = effects.find(node => node.getText(source).includes("tickFight"));
const releaseEffect = effects.find(node => node.getText(source).includes("if (fishingPaused)"));
function invoke(node, scope, ...args) {
  const code = ts.transpileModule(`const fn = ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn fn;`)(...Object.values(scope))(...args);
}
function fixture() {
  let now = 0, uid = 0;
  const frames = new Map(), timers = new Map();
  const save = { current: engine.createDefaultSave() };
  const state = { phase: "casting", tab: "water", message: null, castPos: 0.5, holding: false, escaped: 0, caught: 0 };
  const scope = { ...engine, phase: state.phase, paused: false, tab: state.tab, message: state.message, castPos: state.castPos,
    performance: { now: () => now }, fightRaf: { current: null }, castRaf: { current: null }, castDir: { current: 1 },
    fightRef: { current: { ...engine.createFightState(save.current.upgrades), drift: 0.017 } }, holdingRef: { current: false },
    saveRef: save, resetPendingRef: { current: false }, castPendingRef: { current: false }, fishingGenerationRef: { current: 0 },
    pendingCatchRef: { current: null }, biteTimeout: { current: null },
    getAdPolicy: () => ({ isBusy: () => false }), playSound: () => {},
    synchronizeSave: () => save.current,
    commitSave: async transform => { const next = transform(save.current); if (!next) return { value: null }; save.current = engine.migrateSave(engine.serializeSave(next)); return { value: JSON.stringify(save.current) }; },
    finishEscape: () => state.escaped++, finishCatch: () => state.caught++,
    setPhase: phase => { state.phase = phase; scope.phase = phase; },
    setCastPos: value => { state.castPos = typeof value === "function" ? value(state.castPos) : value; scope.castPos = state.castPos; },
    setFight: fight => { scope.fightRef.current = fight; }, setHolding: holding => { state.holding = holding; },
    setLastResult: () => {}, setMessage: message => { state.message = message; },
    window: { requestAnimationFrame: fn => { frames.set(++uid, fn); return uid; }, cancelAnimationFrame: id => frames.delete(id),
      setTimeout: (fn, delay) => { timers.set(++uid, { fn, due: now + delay }); return uid; }, clearTimeout: id => timers.delete(id) },
  };
  const update = () => {
    Object.assign(scope, { phase: state.phase, tab: state.tab, message: state.message });
    const initializer = variables.get("fishingPaused");
    // Baseline lacks the derived pause. Its exact production effects use paused.
    scope.fishingPaused = initializer ? Function(...Object.keys(scope), `return ${initializer.getText(source)};`)(...Object.values(scope)) : scope.paused;
    if (releaseEffect) invoke(releaseEffect, scope);
  };
  return { state, scope, save, frames, timers, update,
    run: effect => { update(); return invoke(effect, scope); },
    advance: ms => { now += ms; },
    frame: () => { const entry = frames.entries().next().value; assert.ok(entry, "actual scheduled frame"); frames.delete(entry[0]); now += 16.67; entry[1](now); },
    bite: () => { const job = timers.get(scope.biteTimeout.current); assert.ok(job); now = job.due; timers.delete(scope.biteTimeout.current); job.fn(); },
  };
}

test("casting pauses for hidden controls or modal; resumes one actual frame without elapsed catchup", () => {
  for (const reason of ["gear", "message"]) {
    const f = fixture(); let cleanup = f.run(castEffect); f.frame(); const position = f.state.castPos;
    cleanup(); if (reason === "gear") f.state.tab = "gear"; else f.state.message = "Не хватает жемчуга";
    cleanup = f.run(castEffect); assert.equal(f.frames.size, 0, `${reason}: hidden cast must not advance`);
    f.advance(90_000); assert.equal(f.state.castPos, position);
    f.state.tab = "water"; f.state.message = null; cleanup?.(); cleanup = f.run(castEffect); f.frame();
    assert.ok(Math.abs(f.state.castPos - position - 0.018) < 1e-12);
    cleanup();
  }
});

test("fight releases holding and pauses for gear/modal/native hide; restore uses a fresh frame clock", async () => {
  for (const reason of ["gear", "message", "native"]) {
    const f = fixture(); f.state.phase = "fighting"; f.state.holding = true; f.scope.holdingRef.current = true;
    let cleanup = f.run(fightEffect); f.frame(); cleanup();
    if (reason === "gear") f.state.tab = "gear"; else if (reason === "message") f.state.message = "Не хватает жемчуга"; else f.scope.paused = true;
    cleanup = f.run(fightEffect); await Promise.resolve(); assert.equal(f.frames.size, 0); assert.equal(f.state.holding, false); assert.equal(f.scope.holdingRef.current, false);
    const before = structuredClone(f.scope.fightRef.current); f.advance(90_000); assert.deepEqual(f.scope.fightRef.current, before); assert.equal(f.state.escaped, 0);
    f.state.tab = "water"; f.state.message = null; f.scope.paused = false; cleanup?.(); cleanup = f.run(fightEffect); f.frame();
    const expected = engine.tickFight(before, false, 1);
    assert.ok(Math.abs(f.scope.fightRef.current.tension - expected.tension) < 1e-12, "paused90s must not be charged on return");
    assert.equal(f.state.escaped, 0); cleanup();
  }
});

test("actual waiting bite may complete off-page but neither consumes another bait nor runs hidden fight; return resumes", async () => {
  const f = fixture(); await invoke(variables.get("lockCast"), f.scope); assert.equal(f.state.phase, "waiting"); assert.equal(f.save.current.bait.worm, 19);
  f.state.tab = "gear"; f.bite(); assert.equal(f.state.phase, "fighting"); let cleanup = f.run(fightEffect);
  assert.equal(f.frames.size, 0); f.advance(90_000); assert.equal(f.state.escaped, 0); assert.equal(f.state.caught, 0); assert.equal(f.save.current.bait.worm, 19);
  f.state.tab = "water"; cleanup?.(); cleanup = f.run(fightEffect); const before = f.scope.fightRef.current.tension; f.frame();
  assert.ok(f.scope.fightRef.current.tension > before); assert.equal(f.state.escaped, 0); assert.equal(f.save.current.bait.worm, 19); cleanup();
});
