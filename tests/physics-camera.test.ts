import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBaseScale,
  computeTargetCamera,
  computeZoomMultiplier,
  effectiveCameraWidth,
} from "../src/camera.ts";
import {
  START_X,
  VEHICLES,
  deriveVehicleStats,
} from "../src/constants.ts";
import { heightAt, setWorldSeed } from "../src/physics/terrain.ts";
import { VehiclePhysics } from "../src/physics/VehiclePhysics.ts";
import { posterTerrainScreenY } from "../src/ui/PosterGenerator.ts";

function stepPhysics(
  physics: VehiclePhysics,
  steps: number,
  input: {
    throttle: boolean;
    brake: boolean;
    gasHeld: boolean;
    brakeHeld: boolean;
    canDrive: boolean;
  },
  stats = deriveVehicleStats({ engine: 1, suspension: 1, tires: 1, fuel: 1 }),
  nitro = false,
) {
  let last = physics.solve(1 / 120, input, stats, { nitro });
  for (let i = 1; i < steps; i++) {
    last = physics.solve(1 / 120, input, stats, { nitro });
  }
  return last;
}

test("start shelf provides a 2.5m flat launch apron and VehiclePhysics rests cleanly on it", () => {
  setWorldSeed(0);
  assert.equal(heightAt(START_X), 0);
  assert.equal(heightAt(START_X - 1.5), 0);
  assert.equal(heightAt(START_X - 2.49), 0);
  assert.ok(heightAt(START_X - 4) < -0.5);

  const physics = new VehiclePhysics(VEHICLES.rally);
  physics.reset();
  assert.equal(physics.car.x, START_X);
  assert.equal(physics.car.vx, 0);

  // Settling at idle on the launch pad should stay calm and grounded
  const idle = stepPhysics(physics, 60, {
    throttle: false,
    brake: false,
    gasHeld: false,
    brakeHeld: false,
    canDrive: true,
  });
  assert.equal(idle.wheelGrounded, true);
  assert.equal(idle.crashed, false);
  assert.ok(Math.abs(physics.car.vx) < 1.2);
});

test("brake slows forward motion first, fresh brake at standstill reverses naturally without hard cap", () => {
  setWorldSeed(0);
  const physics = new VehiclePhysics(VEHICLES.rally);
  const stats = deriveVehicleStats({ engine: 5, suspension: 5, tires: 5, fuel: 5 });
  physics.reset();

  // Accelerate forward first
  stepPhysics(
    physics,
    180,
    { throttle: true, brake: false, gasHeld: true, brakeHeld: false, canDrive: true },
    stats,
  );
  const speedBeforeBraking = physics.car.vx;
  assert.ok(speedBeforeBraking > 6);

  // Holding brake continuously from speed slows down without shifting straight into reverse
  stepPhysics(
    physics,
    240,
    { throttle: false, brake: true, gasHeld: false, brakeHeld: true, canDrive: true },
    stats,
  );
  const speedAfterBraking = physics.car.vx;
  assert.ok(speedAfterBraking < speedBeforeBraking);
  assert.ok(speedAfterBraking > -0.5, `expected braking without reverse gear, got ${speedAfterBraking}`);

  // Fresh brake press at standstill enters natural reverse gear
  physics.reset();
  stepPhysics(
    physics,
    180,
    { throttle: false, brake: true, gasHeld: false, brakeHeld: true, canDrive: true },
    stats,
  );
  const reverseSpeed = physics.car.vx;
  assert.ok(reverseSpeed < -2, `expected natural reverse acceleration, got ${reverseSpeed}`);

  // Holding both pedals clears reverse mode ("brake wins" stops reverse drive)
  stepPhysics(
    physics,
    120,
    { throttle: false, brake: true, gasHeld: true, brakeHeld: true, canDrive: true },
    stats,
  );
  assert.ok(physics.car.vx > reverseSpeed, "expected dual-pedal brake to slow reverse");
});

test("bodyContact detects belly/bumper scraping separately from wheelGrounded", () => {
  setWorldSeed(0);
  const physics = new VehiclePhysics(VEHICLES.truck);
  const stats = deriveVehicleStats({ engine: 1, suspension: 1, tires: 1, fuel: 1 });
  physics.reset();

  // High in the air: neither wheels nor chassis touch ground
  physics.car.y -= 10;
  const airborne = physics.solve(
    1 / 120,
    { throttle: false, brake: false, gasHeld: false, brakeHeld: false, canDrive: true },
    stats,
    { nitro: false },
  );
  assert.equal(airborne.wheelGrounded, false);
  assert.equal(airborne.bodyContact, false);
  assert.equal(airborne.grounded, false);

  // Drop lower nose-down so chassis probe dips past ground
  physics.reset();
  physics.car.y += 1.4;
  const scrape = physics.solve(
    1 / 120,
    { throttle: false, brake: false, gasHeld: false, brakeHeld: false, canDrive: true },
    stats,
    { nitro: false },
  );
  assert.equal(scrape.bodyContact, true);
  assert.equal(scrape.grounded, true);
});

test("camera scale is strictly linear across desktop and mobile and reflects dynamic zoom", () => {
  const desktopBase = computeBaseScale(1920, 36);
  const mobileBase = computeBaseScale(390, 36);
  assert.equal(effectiveCameraWidth(1920, desktopBase), 36);
  assert.equal(effectiveCameraWidth(390, mobileBase), 36);

  // Intro screen preserves exact requested cameraWidth
  const introCam = computeTargetCamera(
    "intro",
    1920,
    1080,
    desktopBase,
    desktopBase,
    { x: START_X, y: 0, vx: 0, crashed: false },
    { nitroTime: 0 },
  );
  assert.equal(introCam.scale, desktopBase);

  // Playing at high speed + nitro widens live effective FOV consistently
  const targetCam = computeTargetCamera(
    "playing",
    1920,
    1080,
    desktopBase,
    desktopBase,
    { x: START_X + 100, y: 0, vx: 46, crashed: false },
    { nitroTime: 2 },
  );
  const zoom = computeZoomMultiplier(46, true);
  assert.ok(zoom < 0.9);
  assert.equal(targetCam.scale, desktopBase * zoom);
  assert.ok(effectiveCameraWidth(1920, targetCam.scale) > 36);
});

test("empty fuel blocks reverse gear and nitro cruise thrust", () => {
  setWorldSeed(0);
  const stats = deriveVehicleStats({ engine: 5, suspension: 5, tires: 5, fuel: 5 });

  // Dry tank + fresh brake press at standstill must not reverse
  const physics = new VehiclePhysics(VEHICLES.rally);
  physics.reset();
  stepPhysics(
    physics,
    180,
    { throttle: false, brake: true, gasHeld: false, brakeHeld: true, canDrive: false },
    stats,
    false,
  );
  assert.ok(
    physics.car.vx > -0.2,
    `empty tank should not power reverse, got vx=${physics.car.vx}`,
  );

  // Dry tank + active nitro off-throttle must not propel forward
  physics.reset();
  stepPhysics(
    physics,
    180,
    { throttle: false, brake: false, gasHeld: false, brakeHeld: false, canDrive: false },
    stats,
    true,
  );
  assert.ok(
    physics.car.vx < 0.5,
    `empty tank should not drive nitro cruise, got vx=${physics.car.vx}`,
  );
});

test("coasting drag is shared across axles rather than multiplying on 3-axle truck", () => {
  setWorldSeed(0);
  const stats = deriveVehicleStats({ engine: 1, suspension: 1, tires: 1, fuel: 1 });
  const truck = new VehiclePhysics(VEHICLES.truck);
  truck.reset();
  // Settle suspension on the flat apron before measuring pure coasting deceleration
  stepPhysics(
    truck,
    60,
    { throttle: false, brake: false, gasHeld: false, brakeHeld: false, canDrive: true },
    stats,
    false,
  );
  truck.car.vx = 10;
  const res = stepPhysics(
    truck,
    60, // 0.5 s over x = 6..11 (all within the flat d < 7 smoothstep zone)
    { throttle: false, brake: false, gasHeld: false, brakeHeld: false, canDrive: true },
    stats,
    false,
  );
  assert.equal(res.wheelGrounded, true);
  // Shared 124 N drag + aero drag drops vx from 10 to ~9.46 m/s in 0.5 s (vs ~9.33 if 3x unshared)
  assert.ok(
    truck.car.vx > 9.42 && truck.car.vx < 9.52,
    `truck coasting drag should stay around 124 N total (~9.46 m/s), got vx=${truck.car.vx}`,
  );
});

test("updated roofPoints trigger crashes when inverted and forceCrash transitions cleanly", () => {
  setWorldSeed(0);
  const stats = deriveVehicleStats({ engine: 1, suspension: 1, tires: 1, fuel: 1 });

  for (const config of Object.values(VEHICLES)) {
    const physics = new VehiclePhysics(config);
    physics.reset();
    physics.car.angle = Math.PI;
    physics.car.y = -0.3;
    const ev = physics.solve(
      1 / 120,
      { throttle: false, brake: false, gasHeld: false, brakeHeld: false, canDrive: true },
      stats,
      { nitro: false },
    );
    assert.equal(ev.crashed, true, `${config.id} inverted on ground should crash`);
  }

  const tipped = new VehiclePhysics(VEHICLES.rally);
  tipped.reset();
  assert.equal(tipped.forceCrash(), true);
  assert.equal(tipped.car.crashed, true);
  assert.equal(tipped.forceCrash(), false);
});

test("posterTerrainScreenY matches Canvas Y-down terrain orientation", () => {
  const groundY = 505;
  // Uphill to the right: world height becomes smaller (more negative), so screen Y must rise (< groundY)
  assert.ok(posterTerrainScreenY(groundY, -2, 0) < groundY);
  // Downhill to the right: world height becomes larger (positive), so screen Y must drop (> groundY)
  assert.ok(posterTerrainScreenY(groundY, 2, 0) > groundY);
});
