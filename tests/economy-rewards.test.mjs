import assert from "node:assert/strict";
import test from "node:test";
import { BAIT_CAP, rewardBaitAmount, grantBaitPack, refreshRewards, createDefaultSave, migrateSave, serializeSave, gatherEmergencyBait } from "../app/game-engine.ts";
test("partial bait reward is truthful, capped, and survives save reload", () => {
  const save = createDefaultSave(); const bait = { ...save.bait, worm: BAIT_CAP - 3 };
  assert.equal(rewardBaitAmount(bait), 3);
  const rewarded = grantBaitPack(bait, rewardBaitAmount(bait));
  assert.equal(rewarded.worm, BAIT_CAP); assert.equal(migrateSave(serializeSave({ ...save, bait: rewarded })).bait.worm, BAIT_CAP);
  assert.equal(rewardBaitAmount(rewarded), 0); assert.equal(grantBaitPack(rewarded, 8).worm, BAIT_CAP);
});
test("day reset preserves the last successful reward cooldown", () => {
  const refreshed = refreshRewards({ date: "2000-01-01", count: 8, lastRewardAt: 1_700_000_000_000 }, "2000-01-02");
  assert.equal(refreshed.count, 0); assert.equal(refreshed.lastRewardAt, 1_700_000_000_000);
});
test("reward limits do not remove free recovery when all bait is exhausted", () => {
  const empty = { worm: 0, bread: 0, fly: 0, spinner: 0 };
  const recovered = gatherEmergencyBait(empty, 24, []);
  assert.equal(recovered.worm, 1); assert.equal(rewardBaitAmount(recovered), 8);
});
