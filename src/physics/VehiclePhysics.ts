import {
  AIR_DAMPING,
  BRAKE,
  DAMPER,
  DUAL_PEDAL_DAMPING,
  GRAVITY,
  GROUND_DAMPING,
  SPRING,
  START_X,
} from "../constants";
import type {
  BodyImpact,
  CarState,
  DriveInput,
  PhysicsEvents,
  VehicleConfig,
  VehicleStats,
  Vec2,
} from "../types";
import { clamp } from "../utils";
import { heightAt, slopeAt } from "./terrain";

const SPRING_FORCE_CAP = 62000;
const BODY_FORCE_CAP = 46000;
const MAX_LINEAR_SPEED = 45;
const MAX_ANGULAR_SPEED = 13;
const MIN_X = START_X - 4.5;

function createCarState(config: VehicleConfig): CarState {
  const wheels = config.wheelPositions.length;
  return {
    x: START_X,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    omega: 0,
    wheelSpin: new Array<number>(wheels).fill(0),
    contact: new Array<boolean>(wheels).fill(false),
    wheelWorld: Array.from({ length: wheels }, () => ({ x: 0, y: 0 })),
    contactCount: 0,
    maxX: START_X,
    crashed: false,
    crashTimer: 0,
  };
}

/**
 * Multi-wheel rigid-body solver for one car. The body is a single mass with
 * spring/damper suspension at each wheel hub, plus three soft chassis probes
 * that stop the belly punching through crests.
 */
export class VehiclePhysics {
  readonly car: CarState;
  private config: VehicleConfig;

  constructor(config: VehicleConfig) {
    this.config = config;
    this.car = createCarState(config);
  }

  get vehicle(): VehicleConfig {
    return this.config;
  }

  setVehicle(config: VehicleConfig): void {
    const wheelCountChanged =
      config.wheelPositions.length !== this.config.wheelPositions.length;
    this.config = config;
    if (wheelCountChanged) {
      this.car.wheelSpin = new Array<number>(config.wheelPositions.length).fill(0);
      this.car.contact = new Array<boolean>(config.wheelPositions.length).fill(
        false,
      );
      this.car.wheelWorld = Array.from(
        { length: config.wheelPositions.length },
        () => ({ x: 0, y: 0 }),
      );
    }
  }

  /** Park the car on the start line with every wheel resting on the slope. */
  reset(): void {
    this.placeAt(START_X, 0.03);
    this.car.maxX = START_X;
  }

  /** Drop the car back onto the ridge after a crash / soft-lock. */
  teleportTo(x: number): void {
    this.placeAt(x, 0.32);
  }

  private placeAt(x: number, lift: number): void {
    const car = this.car;
    const config = this.config;
    car.x = x;
    car.y = heightAt(x) - (config.wheelRadius + config.wheelLocalY + lift);
    car.angle = Math.atan(slopeAt(x));
    car.vx = 0;
    car.vy = 0;
    car.omega = 0;
    car.wheelSpin.fill(0);
    car.contact.fill(false);
    car.contactCount = 0;
    car.crashed = false;
    car.crashTimer = 0;
    this.updateWheelWorld();
  }

  private updateWheelWorld(): void {
    const car = this.car;
    const config = this.config;
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    for (let i = 0; i < config.wheelPositions.length; i++) {
      const lx = config.wheelPositions[i]!;
      const ly = config.wheelLocalY;
      car.wheelWorld[i]!.x = car.x + lx * c - ly * s;
      car.wheelWorld[i]!.y = car.y + lx * s + ly * c;
    }
  }

  private roofHitsGround(): boolean {
    const car = this.car;
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    for (const point of this.config.roofPoints) {
      if (this.worldY(point, c, s) > heightAt(this.worldX(point, c, s)) - 0.02) {
        return true;
      }
    }
    return false;
  }

  private worldX(point: Vec2, c: number, s: number): number {
    return this.car.x + point.x * c - point.y * s;
  }

  private worldY(point: Vec2, c: number, s: number): number {
    return this.car.y + point.x * s + point.y * c;
  }

  solve(dt: number, input: DriveInput, stats: VehicleStats): PhysicsEvents {
    const car = this.car;
    const config = this.config;
    const wasGrounded = car.contactCount > 0;
    const impacts: BodyImpact[] = [];

    let ax = 0;
    let ay = GRAVITY;
    let alpha = 0;
    car.contactCount = 0;

    const cosA = Math.cos(car.angle);
    const sinA = Math.sin(car.angle);
    const wheelCount = config.wheelPositions.length;
    const wheelRadius = config.wheelRadius;

    for (let i = 0; i < wheelCount; i++) {
      const lx = config.wheelPositions[i]!;
      const ly = config.wheelLocalY;
      const wx = car.x + lx * cosA - ly * sinA;
      const wy = car.y + lx * sinA + ly * cosA;
      const gy = heightAt(wx);
      const slope = slopeAt(wx);
      const norm = 1 / Math.sqrt(1 + slope * slope);
      const nx = slope * norm;
      const ny = -norm;
      const tx = norm;
      const ty = slope * norm;
      const rx = wx - car.x;
      const ry = wy - car.y;
      const pvx = car.vx - car.omega * ry;
      const pvy = car.vy + car.omega * rx;
      const vn = pvx * nx + pvy * ny;
      const vt = pvx * tx + pvy * ty;
      const pen = (wy - gy) * norm + wheelRadius;

      car.wheelWorld[i]!.x = wx;
      car.wheelWorld[i]!.y = wy;
      car.contact[i] = pen > 0;

      const share = config.wheelShares[i] ?? 1 / wheelCount;

      if (pen > 0) {
        car.contactCount++;
        const compression = Math.min(pen, 0.7);
        let fn =
          SPRING * stats.springFactor * compression -
          DAMPER * stats.damperFactor * vn;
        fn = clamp(fn, 0, SPRING_FORCE_CAP);
        ax += (nx * fn) / config.mass;
        ay += (ny * fn) / config.mass;
        alpha += (rx * ny * fn - ry * nx * fn) / config.inertia;

        let ft = 0;
        if (input.throttle) {
          ft += config.engineBase * stats.engineFactor * share;
        }
        if (input.brake) {
          if (vt > 0.8) ft -= BRAKE * share;
          else if (vt > -0.6) ft -= config.engineBase * 0.54 * share;
        }
        if (!input.throttle && !input.brake) {
          ft -= Math.sign(vt) * Math.min(Math.abs(vt) * 16, 62);
        }
        const traction = fn * 1.45 * stats.gripFactor;
        ft = clamp(ft, -traction, traction);
        ax += (tx * ft) / config.mass;
        ay += (ty * ft) / config.mass;
        alpha += ((rx * ty - ry * tx) * ft * 0.38) / config.inertia;

        car.wheelSpin[i]! += (vt / wheelRadius) * dt + (input.throttle ? 7.5 * dt : 0);
      } else {
        car.wheelSpin[i]! += (car.vx / wheelRadius) * dt * 0.45;
      }
    }

    // Soft chassis probes: rear bumper, belly and front bumper are a second
    // line of defence so sharp crests cannot clip straight through the body.
    for (const point of config.chassisPoints) {
      const wx = car.x + point.x * cosA - point.y * sinA;
      const wy = car.y + point.x * sinA + point.y * cosA;
      const gy = heightAt(wx);
      if (wy <= gy) continue;
      const slope = slopeAt(wx);
      const norm = 1 / Math.sqrt(1 + slope * slope);
      const nx = slope * norm;
      const ny = -norm;
      const tx = norm;
      const ty = slope * norm;
      const penetration = (wy - gy) * norm;
      car.x += nx * penetration * 0.45;
      car.y += ny * penetration * 0.45;
      const rx = wx - car.x;
      const ry = wy - car.y;
      const pvx = car.vx - car.omega * ry;
      const pvy = car.vy + car.omega * rx;
      const vn = pvx * nx + pvy * ny;
      if (vn < 0) {
        const fn = Math.min(
          BODY_FORCE_CAP,
          Math.max(0, penetration * 16000 - vn * 1200),
        );
        ax += (nx * fn) / config.mass;
        ay += (ny * fn) / config.mass;
        alpha += (rx * ny * fn - ry * nx * fn) / config.inertia;
        const vt = pvx * tx + pvy * ty;
        const scrape = Math.min(Math.abs(vt) * 1.6, 9);
        ax -= tx * Math.sign(vt) * scrape;
        ay -= ty * Math.sign(vt) * scrape;
        if (vn < -2.2) impacts.push({ x: wx, y: gy, strength: -vn });
      }
    }

    if (car.contactCount === 0 && !car.crashed) {
      // Running dry leaves only a faint weight-shift authority.
      const airTorque = input.canDrive ? config.rotTorque : 0.95;
      if (input.gasHeld && !input.brakeHeld) alpha -= airTorque;
      if (input.brakeHeld && !input.gasHeld) alpha += airTorque;
      if (input.gasHeld && input.brakeHeld) {
        // Both pedals in the air: attitude stabiliser.
        alpha -= car.omega * DUAL_PEDAL_DAMPING;
      } else {
        alpha -= car.omega * AIR_DAMPING;
      }
    } else {
      alpha -= car.omega * GROUND_DAMPING;
    }

    ax -= car.vx * Math.abs(car.vx) * 0.0024;
    ay -= car.vy * Math.abs(car.vy) * 0.0017;
    ax -= car.vx * 0.035;

    car.vx = clamp(car.vx + ax * dt, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
    car.vy = clamp(car.vy + ay * dt, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
    car.omega = clamp(
      car.omega + alpha * dt,
      -MAX_ANGULAR_SPEED,
      MAX_ANGULAR_SPEED,
    );
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.angle += car.omega * dt;

    if (car.x < MIN_X) {
      car.x = MIN_X;
      if (car.vx < 0) car.vx = -car.vx * 0.2;
    }

    let crashed = false;
    if (!car.crashed) {
      const roll = Math.abs(Math.atan2(Math.sin(car.angle), Math.cos(car.angle)));
      if (this.roofHitsGround() || (roll > 2.25 && car.contactCount > 0)) {
        car.crashed = true;
        car.crashTimer = 0;
        car.omega *= 0.55;
        crashed = true;
      }
    }

    return {
      wasGrounded,
      grounded: car.contactCount > 0,
      crashed,
      impacts,
    };
  }
}
