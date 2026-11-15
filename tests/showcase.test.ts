import test from "node:test";
import assert from "node:assert/strict";
import { START_X, VEHICLES } from "../src/constants.ts";
import { biomePaletteAt, stageInfoAt } from "../src/physics/biomes.ts";
import { VehiclePhysics } from "../src/physics/VehiclePhysics.ts";
import { heightAt, setWorldSeed } from "../src/physics/terrain.ts";
import { HomeShowcase } from "../src/render/HomeShowcase.ts";
import type { RenderContext } from "../src/types.ts";

test("menu showcase seats all three vehicles on the real slope without moving the live spawn or FOV", () => {
  setWorldSeed(0);
  const live = new VehiclePhysics(VEHICLES.rally);
  live.reset();
  const original = structuredClone(live.car);
  const view = { x: START_X, y: 0, scale: 40 };
  const rc: RenderContext = {
    ctx: {} as CanvasRenderingContext2D,
    width: 1440, height: 900, view, time: 0,
    stage: stageInfoAt(0), palette: biomePaletteAt(0),
  };
  const showcase = new HomeShowcase();
  for (const config of Object.values(VEHICLES)) {
    const composed = showcase.compose(rc, config);
    assert.notEqual(composed.view, view);
    assert.equal(composed.width / composed.view.scale, 36);
    assert.ok(showcase.car.x > START_X + 20);
    for (const wheel of showcase.car.wheelWorld) {
      const clearance = (heightAt(wheel.x) - wheel.y) * Math.cos(showcase.car.angle) - config.wheelRadius;
      assert.ok(Math.abs(clearance) < 0.12, `${config.id} wheel must sit on the slope, clearance=${clearance}`);
    }
    assert.deepEqual(live.car, original);
    assert.deepEqual(view, { x: START_X, y: 0, scale: 40 });
  }
});
