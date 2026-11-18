import test from "node:test";
import assert from "node:assert/strict";
import { STAGE_LENGTH, START_X } from "../src/constants.ts";
import { generateChunkItems } from "../src/items.ts";
import { stageInfoAt } from "../src/physics/biomes.ts";
import { setWorldSeed } from "../src/physics/terrain.ts";
import type { Item } from "../src/types.ts";

test("chunk items avoid overlap and space fuel evenly after launch", () => {
  const seeds = [0, 1234, 987654321];
  try {
    for (const seed of seeds) {
      setWorldSeed(seed);
      const all: Item[] = [];
      for (let chunk = 0; chunk < 40; chunk++) {
        const before = all.length;
        generateChunkItems(chunk, all);
        const chunkItems = all.slice(before);
        const fuels = chunkItems.filter((item) => item.type === "fuel");
        if (chunk >= 2 && chunk % 4 === 2) {
          assert.equal(fuels.length, 1, `expected 1 fuel in chunk ${chunk}`);
        } else {
          assert.equal(fuels.length, 0, `unexpected fuel in chunk ${chunk}`);
        }

        const powerups = chunkItems.filter((item) => item.type !== "coin");
        const coins = chunkItems.filter((item) => item.type === "coin");
        for (let i = 0; i < powerups.length; i++) {
          for (let j = i + 1; j < powerups.length; j++) {
            assert.ok(
              Math.abs(powerups[i]!.x - powerups[j]!.x) > 5.4,
              `overlapping powerups in chunk ${chunk} (seed=${seed})`,
            );
          }
          for (const coin of coins) {
            assert.ok(
              Math.abs(powerups[i]!.x - coin.x) > 4.4,
              `powerup overlapped coin in chunk ${chunk} (seed=${seed})`,
            );
          }
        }
        for (const item of chunkItems) {
          assert.ok(item.x >= START_X + chunk * 44);
        }
      }
    }
  } finally {
    setWorldSeed(0);
  }
});

test("stageInfoAt formats multi-loop global stage numbers continuously", () => {
  const s1 = stageInfoAt(0);
  assert.equal(s1.stageLabel, "STAGE 01");
  assert.equal(s1.cycle, 0);

  const s5 = stageInfoAt(4 * STAGE_LENGTH);
  assert.equal(s5.index, 0);
  assert.equal(s5.cycle, 1);
  assert.equal(s5.stageLabel, "STAGE 05");

  const s10 = stageInfoAt(9 * STAGE_LENGTH + 120);
  assert.equal(s10.index, 1);
  assert.equal(s10.cycle, 2);
  assert.equal(s10.stageLabel, "STAGE 10");
});
