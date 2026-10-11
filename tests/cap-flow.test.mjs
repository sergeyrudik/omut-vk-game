import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as engine from "../app/game-engine.ts";
const game = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).name.replace("-vk-game", "");
const source = ts.createSourceFile("page.tsx", fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(scope) {
  let arrow;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "buyUpgrade") arrow = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow && ts.isArrowFunction(arrow));
  const code = ts.transpileModule(`const invoke = ${arrow.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn invoke;`)(...Object.values(scope));
}
function fixture(key, level) {
  const state = engine.createDefaultSave(); state.upgrades[key] = level;
  const resource = game === "gorn" ? "coal" : "pearls";
  state[resource] = 9999; if (game === "gorn") state.ingots = engine.INGOT_CAP;
  const messages = []; const noop = () => {};
  const scope = { ...engine, ...state, tutorialDone: true, paused: false,
    getAdPolicy: () => ({ isBusy: () => false, startGameplay: noop }),
    setMessage: value => messages.push(value), playSound: noop, trackEvent: noop,
  };
  for (const k of ["coal", "pearls", "ingots", "upgrades", "daily"]) scope[`set${k[0].toUpperCase()}${k.slice(1)}`] = value => { state[k] = typeof value === "function" ? value(state[k]) : value; };
  return { state, messages, run: () => actual(scope)(key) };
}
test(`${game}: every actual upgrade handler accepts the final persisted level then refuses further charging`, () => {
  for (const key of Object.keys(engine.UPGRADE_DATA)) {
    const f = fixture(key, engine.MAX_UPGRADE_LEVEL - 1); const before = structuredClone(f.state);
    f.run(); assert.equal(f.state.upgrades[key], engine.MAX_UPGRADE_LEVEL);
    const resource = game === "gorn" ? "coal" : "pearls";
    assert.equal(before[resource] - f.state[resource], engine.getUpgradeCost(engine.MAX_UPGRADE_LEVEL - 1));
    if (game === "gorn") assert.equal(before.ingots - f.state.ingots, engine.getUpgradeIngotCost(key, engine.MAX_UPGRADE_LEVEL - 1));
    assert.equal(engine.migrateSave(engine.serializeSave(f.state)).upgrades[key], engine.MAX_UPGRADE_LEVEL);
    const full = fixture(key, engine.MAX_UPGRADE_LEVEL); const unchanged = structuredClone(full.state);
    full.run(); assert.deepEqual(full.state, unchanged); assert.deepEqual(full.messages, ["Максимальный уровень улучшения"]);
  }
});
if (game === "omut") {
  test("paid five-bait packs decline full/partial stock for all four bait kinds without consuming coins", () => {
    for (const id of Object.keys(engine.BAIT_DATA)) for (const count of [engine.BAIT_CAP, engine.BAIT_CAP - 1, engine.BAIT_CAP - 4]) {
      const bait = { ...engine.createDefaultSave().bait, [id]: count };
      const result = engine.buyBait(bait, 500, id, 5);
      assert.equal(result.ok, false); assert.equal(result.coins, 500); assert.equal(result.bait, bait);
    }
  });
  test("a paid bait pack fits exactly at cap and keeps all five through save reload; invalid quantities cannot create coins", () => {
    for (const id of Object.keys(engine.BAIT_DATA)) {
      const save = engine.createDefaultSave(); save.bait[id] = engine.BAIT_CAP - 5;
      const result = engine.buyBait(save.bait, 500, id, 5);
      assert.equal(result.ok, true); assert.equal(result.bait[id], engine.BAIT_CAP);
      assert.equal(500 - result.coins, engine.BAIT_DATA[id].cost * 5);
      const restored = engine.migrateSave(engine.serializeSave({ ...save, bait: result.bait, coins: result.coins }));
      assert.equal(restored.bait[id], engine.BAIT_CAP); assert.equal(restored.coins, result.coins);
      for (const amount of [0, -5, 1.5, NaN]) {
        const declined = engine.buyBait(save.bait, 500, id, amount);
        assert.equal(declined.ok, false); assert.equal(declined.coins, 500); assert.equal(declined.bait, save.bait);
      }
    }
  });
}
