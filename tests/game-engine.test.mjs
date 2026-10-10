import assert from "node:assert/strict";
import test from "node:test";

import {
  FISH_CATALOG,
  evaluateCast,
  gatherEmergencyBait,
  buyBait,
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


test("migration preserves timestamps, reward cooldown and newest cloud progress", () => {
  const now = Date.now();
  const saved = createDefaultSave();
  saved.updatedAt = now - 1000;
  saved.rewards.lastRewardAt = now - 500;
  const local = migrateSave(JSON.stringify(saved));
  const cloud = migrateSave(JSON.stringify({ ...saved, updatedAt: now }));
  assert.equal(local.updatedAt, now - 1000);
  assert.equal(local.rewards.lastRewardAt, now - 500);
  assert.equal(selectNewestSave(local, cloud), cloud);
});


test("exhausting all starter and purchased bait cannot permanently lock fishing", () => {
  const save = createDefaultSave();
  const empty = { worm: 0, bread: 0, spinner: 0, fly: 0 };
  // 27 starter casts, 3 five-worm packs for 75 coins, daily +60 coins,
  // then 2 more packs for 50 coins: 52 misses leave 15 coins and no bait.
  let budget = save.coins;
  for (let i = 0; i < 3; i++) budget = buyBait(empty, budget, "worm", 5).coins;
  budget += 60;
  for (let i = 0; i < 2; i++) budget = buyBait(empty, budget, "worm", 5).coins;
  assert.equal(budget, 15);
  const recovered = gatherEmergencyBait(empty, budget, []);
  assert.deepEqual(recovered, { ...empty, worm: 1 });
  assert.deepEqual(empty, { worm: 0, bread: 0, spinner: 0, fly: 0 });
  assert.equal(gatherEmergencyBait(recovered, budget, []), null);
  const restored = migrateSave(serializeSave({ ...save, coins: budget, bait: recovered }));
  assert.equal(restored.bait.worm, 1);
  assert.equal(restored.coins, budget);
});

test("emergency bait is unavailable while normal fishing resources remain", () => {
  const empty = { worm: 0, bread: 0, spinner: 0, fly: 0 };
  assert.equal(gatherEmergencyBait(empty, 25, []), null);
  assert.equal(gatherEmergencyBait({ ...empty, fly: 1 }, 0, []), null);
  assert.equal(gatherEmergencyBait(empty, 0, [{ uid: 1 }]), null);
  assert.deepEqual(gatherEmergencyBait(empty, 24, []), { ...empty, worm: 1 });
});


test("all 24 album fish are obtainable from documented locations and rarities", () => {
  const rolls = { legendary: 0.005, epic: 0.02, rare: 0.1, uncommon: 0.3, common: 0.8 };
  const save = createDefaultSave();
  const album = {};
  let uid = 1;
  for (const def of FISH_CATALOG) {
    const location = def.locations[0];
    const pool = FISH_CATALOG.filter((fish) => fish.locations.includes(location) && fish.rarity === def.rarity);
    const values = [rolls[def.rarity], (pool.findIndex((fish) => fish.id === def.id) + 0.5) / pool.length, 0.5];
    const catchResult = rollCatch(location, save.upgrades, "worm", "ok", uid++, () => values.shift());
    assert.equal(catchResult.fishId, def.id);
    assert.ok(catchResult.weight >= def.minWeight && catchResult.weight <= def.maxWeight);
    assert.ok(sellFishValue(catchResult) > 0);
    album[def.id] = 1;
  }
  assert.deepEqual(albumProgress(album), { caught: 24, total: 24 });
  const restored = migrateSave(serializeSave({ ...save, album }));
  assert.deepEqual(albumProgress(restored.album), { caught: 24, total: 24 });
});

test("location thresholds and bait purchases preserve currency on failure", () => {
  assert.deepEqual(getUnlockedLocations(11), ["backwater"]);
  assert.deepEqual(getUnlockedLocations(12), ["backwater", "lake"]);
  assert.deepEqual(getUnlockedLocations(34), ["backwater", "lake"]);
  assert.deepEqual(getUnlockedLocations(35), ["backwater", "lake", "night"]);
  const bait = createDefaultSave().bait;
  const failure = buyBait(bait, 24, "worm", 5);
  assert.equal(failure.ok, false);
  assert.equal(failure.coins, 24);
  assert.deepEqual(failure.bait, bait);
  const bought = buyBait(bait, 25, "worm", 5);
  assert.equal(bought.ok, true);
  assert.equal(bought.coins, 0);
  assert.equal(bought.bait.worm, bait.worm + 5);
  assert.equal(bait.worm, 20);
});
