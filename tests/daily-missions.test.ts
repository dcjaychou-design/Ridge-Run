import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_FIRST_BOUNTY,
  DAILY_RECORD_BOUNTY,
  VEHICLE_ORDER,
} from "../src/constants.ts";
import {
  dailySeedFor,
  dailyVehicleFor,
  fairUpgrades,
  refreshDaily,
  settleDaily,
  utcDateKey,
} from "../src/daily.ts";
import {
  MISSION_TEMPLATES,
  MissionTracker,
  missionDetail,
  missionTitle,
  rollMissions,
  settleCompletedMissions,
} from "../src/missions.ts";
import { defaultSave } from "../src/storage.ts";

test("utcDateKey formats UTC midnight boundaries cleanly", () => {
  const before = new Date("2026-11-15T23:59:59.999Z");
  const after = new Date("2026-11-16T00:00:00.000Z");
  assert.equal(utcDateKey(before), "2026-11-15");
  assert.equal(utcDateKey(after), "2026-11-16");
});

test("dailySeedFor and dailyVehicleFor are deterministic and non-zero", () => {
  const s1 = dailySeedFor("2026-11-15");
  const s2 = dailySeedFor("2026-11-15");
  const s3 = dailySeedFor("2026-11-16");
  assert.equal(s1, s2);
  assert.notEqual(s1, 0);
  assert.notEqual(s1, s3);
  assert.ok(VEHICLE_ORDER.includes(dailyVehicleFor(s1)));
  assert.deepEqual(fairUpgrades(), {
    engine: 5,
    suspension: 5,
    tires: 5,
    fuel: 5,
  });
});

test("refreshDaily resets only daily state and keeps career progress", () => {
  const save = defaultSave();
  save.best = 980;
  save.coins = 420;
  save.dailyDate = "2026-11-15";
  save.dailyBest = 540;
  save.dailyFirstClaimed = true;

  assert.equal(refreshDaily(save, "2026-11-15"), false);
  assert.equal(save.dailyBest, 540);

  assert.equal(refreshDaily(save, "2026-11-16"), true);
  assert.equal(save.dailyDate, "2026-11-16");
  assert.equal(save.dailyBest, 0);
  assert.equal(save.dailyFirstClaimed, false);
  assert.equal(save.dailyGhost, null);
  assert.equal(save.best, 980);
  assert.equal(save.coins, 420);
});

test("settleDaily awards first completion, record bonus, and supports pre-rollover cross-midnight finish", () => {
  const save = defaultSave();
  save.dailyDate = "2026-11-15";

  // Under thresholds: sets dailyBest, zero bounty
  const r1 = settleDaily(save, 120);
  assert.equal(r1.dailyRecord, true);
  assert.equal(r1.firstClaim, false);
  assert.equal(r1.bounty, 0);
  assert.equal(save.dailyBest, 120);

  // Beats previous best and passes 200m + first >150m claim: earns both bounties
  const r2 = settleDaily(save, 240);
  assert.equal(r2.dailyRecord, true);
  assert.equal(r2.firstClaim, true);
  assert.equal(r2.bounty, DAILY_FIRST_BOUNTY + DAILY_RECORD_BOUNTY);
  assert.equal(save.dailyBest, 240);

  // Slower run: no record, no duplicate first claim
  const r3 = settleDaily(save, 190);
  assert.equal(r3.dailyRecord, false);
  assert.equal(r3.firstClaim, false);
  assert.equal(r3.bounty, 0);
  assert.equal(save.dailyBest, 240);

  // Rollover clears daily fields on transition to next UTC day
  assert.equal(refreshDaily(save, "2026-11-16"), true);
  assert.equal(save.dailyBest, 0);
  assert.equal(save.dailyFirstClaimed, false);
});

test("missions roll without duplicate kinds and scale tier every 5 completions", () => {
  let seed = 1;
  const detRng = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const tier0 = rollMissions(0, [], detRng, 3);
  const kinds = new Set(tier0.map((m) => m.kind));
  assert.equal(tier0.length, 3);
  assert.equal(kinds.size, 3);

  const tier2 = rollMissions(10, [], detRng, 3);
  for (const m of tier2) {
    assert.ok(m.reward >= 45);
  }
});

test("MissionTracker updates progress and settleCompletedMissions rotates completed contracts", () => {
  const initial = rollMissions(0, [], () => 0, 3);
  const tracker = new MissionTracker(initial);

  const newlyDone = tracker.update({
    distance: initial[0]!.target + 10,
    flips: 10,
    perfect: 10,
    coins: 0,
    wheelie: 1.24,
    stage: 100,
  });
  assert.ok(newlyDone.length >= 1);
  assert.equal(newlyDone[0]!.done, true);

  const beforeIds = initial.map((m) => m.id);
  const nextCount = settleCompletedMissions(tracker, 0, () => 0.4);
  assert.equal(nextCount, newlyDone.length);
  const afterKinds = new Set(tracker.missions.map((m) => m.kind));
  assert.equal(afterKinds.size, 3);
  for (const m of tracker.missions) {
    assert.equal(m.done, false);
    assert.equal(m.progress, 0);
  }
  assert.notDeepEqual(
    tracker.missions.map((m) => m.id),
    beforeIds,
  );
});

test("all six mission templates scale targets and rewards across three tiers", () => {
  for (const template of Object.values(MISSION_TEMPLATES)) {
    assert.equal(template.targets.length, 3);
    assert.equal(template.rewards.length, 3);
    for (let i = 1; i < 3; i++) {
      assert.ok(template.targets[i]! > template.targets[i - 1]!);
      assert.ok(template.rewards[i]! > template.rewards[i - 1]!);
    }
  }
  const summitStage = {
    id: "stage-1500",
    kind: "stage" as const,
    target: 1500,
    reward: MISSION_TEMPLATES.stage.rewards[2]!,
    progress: 0,
    done: false,
  };
  assert.equal(missionTitle(summitStage), "驶入极夜山巅");
  assert.match(missionDetail(summitStage), /1500m/);
});
