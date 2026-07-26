import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCast,
  getKeepnetCapacity,
  getUnlockedLocations,
  getUpgradeCost,
  migrateSave,
  resolveCast,
  rollCatch,
  selectNewestSave,
  sellFishValue,
  serializeSave,
  createDefaultSave,
  tickFight,
  createFightState,
  albumProgress,
} from "../app/game-engine.ts";

test("cast timing zones", () => {
  assert.equal(evaluateCast(0.5), "perfect");
  assert.equal(evaluateCast(0.35), "ok");
  assert.equal(evaluateCast(0.1), "miss");
});

test("resolveCast spends bait and schedules bite on success", () => {
  const miss = resolveCast("miss", "backwater", { rod: 0, line: 0, keepnet: 0 }, "worm", () => 0.5);
  assert.equal(miss.baitSpent, true);
  assert.equal(miss.biteDelayMs, 0);

  const ok = resolveCast("ok", "backwater", { rod: 2, line: 0, keepnet: 0 }, "worm", () => 0.5);
  assert.ok(ok.biteDelayMs >= 900);
});

test("rollCatch returns fish for successful cast", () => {
  const fish = rollCatch("backwater", { rod: 0, line: 0, keepnet: 0 }, "worm", "perfect", 7, () => 0.2);
  assert.ok(fish);
  assert.equal(fish.uid, 7);
  assert.ok(fish.weight > 0);
});

test("fight tick can catch or escape", () => {
  const state = createFightState({ rod: 0, line: 5, keepnet: 0 });
  let current = { ...state, tension: 0.45, progress: 0.95 };
  const caught = tickFight(current, true, 3);
  assert.equal(caught.status, "caught");

  const escaped = tickFight({ ...state, tension: 0.03, progress: 0.2 }, true, 1);
  assert.equal(escaped.status, "escaped");
});

test("upgrades and locations unlock", () => {
  assert.equal(getUpgradeCost(0), 3);
  assert.equal(getKeepnetCapacity({ rod: 0, line: 0, keepnet: 2 }), 12);
  assert.deepEqual(getUnlockedLocations(0), ["backwater"]);
  assert.ok(getUnlockedLocations(40).includes("night"));
});

test("sell value and album progress", () => {
  const fish = rollCatch("lake", { rod: 3, line: 0, keepnet: 0 }, "spinner", "perfect", 1, () => 0.01);
  assert.ok(fish);
  assert.ok(sellFishValue(fish) >= 1);
  const progress = albumProgress({ roach: 2, perch: 1 });
  assert.equal(progress.caught, 2);
  assert.equal(progress.total, 24);
});

test("save migrate and newest", () => {
  assert.equal(migrateSave("bad"), null);
  const a = createDefaultSave();
  a.updatedAt = 10;
  const b = migrateSave(serializeSave({ ...a, updatedAt: 20, coins: 500 }));
  assert.ok(b);
  assert.equal(selectNewestSave(a, b)?.coins, 500);
});
