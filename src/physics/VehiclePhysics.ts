import {
  AIR_DAMPING,
  BRAKE,
  DAMPER,
  DUAL_PEDAL_DAMPING,
  GRAVITY,
  GROUND_DAMPING,
  MAX_LINEAR_SPEED,
  NITRO_CRUISE,
  NITRO_MAX_SPEED,
  NITRO_THRUST,
  REVERSE_DRAG,
  REVERSE_ENGAGE_SPEED,
  REVERSE_THRUST,
  SPRING,
  START_X,
} from "../constants";
import type {
  BodyImpact,
  CarState,
  DriveInput,
  PhysicsEvents,
  PhysicsModifiers,
  VehicleConfig,
  VehicleStats,
  Vec2,
} from "../types";
import { clamp } from "../utils";
import { surfaceAt, updraftAt } from "./biomes";
import { heightAt, slopeAt } from "./terrain";

const SPRING_FORCE_CAP = 62000;
const BODY_FORCE_CAP = 46000;
/**
 * Whole-car coasting drag, shared across contact wheels by `wheelShares`.
 * Two-wheel rigs keep the exact pre-v2.6 feel (2 × 62 N per wheel); the
 * six-wheel hauler no longer pays a third wheel's worth of drag.
 */
const COAST_DRAG_RATE = 32;
const COAST_DRAG_CAP = 124;
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
  private bodyGrounded = false;
  private reverseMode = false;
  private brakeWasHeld = false;

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
    this.bodyGrounded = false;
    this.reverseMode = false;
    this.brakeWasHeld = false;
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
    this.placeAt(START_X, 0);
    this.car.maxX = START_X;
    this.bodyGrounded = false;
  }

  /**
   * Flag a crash decided outside the solver (e.g. the car has settled on its
   * tail or side and can no longer recover). Returns false if already crashed.
   */
  forceCrash(): boolean {
    if (this.car.crashed) return false;
    this.car.crashed = true;
    this.car.crashTimer = 0;
    this.car.omega *= 0.55;
    return true;
  }

  /** Drop the car back onto the ridge after a crash / soft-lock. */
  teleportTo(x: number): void {
    this.placeAt(x, 0.32);
  }

  /** Fit chassis pitch to the sampled ground under every wheel, then seat it. */
  private placeAt(x: number, lift: number): void {
    const car = this.car;
    const config = this.config;
    const wheelCount = config.wheelPositions.length;
    const ly = config.wheelLocalY;
    let angle = Math.atan(slopeAt(x));

    for (let iter = 0; iter < 3; iter++) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      let sumX = 0;
      let sumY = 0;
      const worldX: number[] = [];
      const groundY: number[] = [];
      for (let i = 0; i < wheelCount; i++) {
        const lx = config.wheelPositions[i]!;
        const wx = x + lx * c - ly * s;
        const gy = heightAt(wx);
        worldX.push(wx);
        groundY.push(gy);
        sumX += wx;
        sumY += gy;
      }
      const meanX = sumX / wheelCount;
      const meanY = sumY / wheelCount;
      let num = 0;
      let den = 0;
      for (let i = 0; i < wheelCount; i++) {
        const dx = worldX[i]! - meanX;
        num += dx * (groundY[i]! - meanY);
        den += dx * dx;
      }
      angle = Math.atan(den > 1e-9 ? num / den : slopeAt(x));
    }

    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // The wheel centre sits r / cos(pitch) above the ground along world Y.
    const radiusOffset = config.wheelRadius / Math.max(0.25, c);
    let desiredYSum = 0;
    for (let i = 0; i < wheelCount; i++) {
      const lx = config.wheelPositions[i]!;
      const wx = x + lx * c - ly * s;
      const gy = heightAt(wx);
      desiredYSum += gy - radiusOffset - lx * s - ly * c;
    }

    car.x = x;
    car.y = desiredYSum / wheelCount - lift;
    car.angle = angle;
    car.vx = 0;
    car.vy = 0;
    car.omega = 0;
    car.wheelSpin.fill(0);
    car.contact.fill(false);
    car.contactCount = 0;
    car.crashed = false;
    car.crashTimer = 0;
    this.bodyGrounded = false;
    this.reverseMode = false;
    this.brakeWasHeld = false;
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

  solve(
    dt: number,
    input: DriveInput,
    stats: VehicleStats,
    modifiers: PhysicsModifiers,
  ): PhysicsEvents {
    const car = this.car;
    const config = this.config;
    const wasWheelGrounded = car.contactCount > 0;
    const wasGrounded = wasWheelGrounded || this.bodyGrounded;
    const impacts: BodyImpact[] = [];

    // The brake pedal doubles as reverse: braking at speed only slows the car,
    // and a fresh press at a crawl engages reverse. Releasing the pedal, or
    // holding both pedals, clears the mode so "brake wins" still holds.
    const brakePressed = input.brake && !this.brakeWasHeld;
    this.brakeWasHeld = input.brake;
    if (!input.brake || input.gasHeld || !input.canDrive) {
      this.reverseMode = false;
    } else if (brakePressed && Math.abs(car.vx) < REVERSE_ENGAGE_SPEED) {
      this.reverseMode = true;
    }

    let ax = 0;
    let ay = GRAVITY;
    let alpha = 0;
    car.contactCount = 0;

    const cosA = Math.cos(car.angle);
    const sinA = Math.sin(car.angle);
    const wheelCount = config.wheelPositions.length;
    const wheelRadius = config.wheelRadius;
    // Nitro cruise is still engine thrust, so it needs fuel too.
    const cruising =
      !input.throttle && modifiers.nitro && !input.brake && input.canDrive;

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
      const surface = surfaceAt(wx, stats.gripFactor);

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
          const boost = modifiers.nitro ? NITRO_THRUST : 1;
          ft += config.engineBase * stats.engineFactor * share * boost;
        } else if (cruising) {
          // Nitro keeps at least 60% cruise thrust even off the throttle.
          ft += config.engineBase * stats.engineFactor * share * NITRO_CRUISE;
        }
        if (input.brake) {
          // Reverse gear is engine-driven: a dry tank leaves only the brakes.
          if (this.reverseMode && input.canDrive) {
            ft -= config.engineBase * REVERSE_THRUST * share;
          } else if (vt > 0.8) {
            ft -= BRAKE * share;
          } else if (vt < -0.8) {
            ft += BRAKE * share;
          } else {
            ft -= Math.sign(vt) * BRAKE * 0.35 * share;
          }
        }
        if (vt < 0) {
          // The low reverse gear has extra drivetrain drag, so reverse speed
          // settles naturally instead of being clamped at a fixed value.
          ft += Math.min(-vt * REVERSE_DRAG, 900) * share;
        }
        if (surface.rollingResistance > 0 && Math.abs(vt) > 0.05) {
          ft -= Math.sign(vt) * surface.rollingResistance * share;
        }
        if (!input.throttle && !cruising) {
          ft -=
            Math.sign(vt) *
            Math.min(Math.abs(vt) * COAST_DRAG_RATE, COAST_DRAG_CAP) *
            share *
            surface.dragMultiplier;
        }
        const traction = fn * 1.45 * stats.gripFactor * surface.grip;
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
    let bodyContact = false;
    for (const point of config.chassisPoints) {
      const wx = car.x + point.x * cosA - point.y * sinA;
      const wy = car.y + point.x * sinA + point.y * cosA;
      const gy = heightAt(wx);
      if (wy <= gy) continue;
      bodyContact = true;
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

    const wheelGrounded = car.contactCount > 0;
    const grounded = wheelGrounded || bodyContact;

    if (!grounded && !car.crashed) {
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

    // Night-summit updraft vents only bite while the car is clear of the ridge.
    if (!grounded) {
      const lift = updraftAt(car.x);
      if (lift > 0) ay -= 3.8 * lift;
    }

    ax -= car.vx * Math.abs(car.vx) * 0.0024;
    ay -= car.vy * Math.abs(car.vy) * 0.0017;
    ax -= car.vx * 0.035;

    const maxSpeed = modifiers.nitro ? NITRO_MAX_SPEED : MAX_LINEAR_SPEED;
    car.vx = clamp(car.vx + ax * dt, -maxSpeed, maxSpeed);
    car.vy = clamp(car.vy + ay * dt, -maxSpeed, maxSpeed);
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

    this.bodyGrounded = bodyContact;

    return {
      wasGrounded,
      grounded,
      wasWheelGrounded,
      wheelGrounded,
      bodyContact,
      crashed,
      impacts,
    };
  }
}
