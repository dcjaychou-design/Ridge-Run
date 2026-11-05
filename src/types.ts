/* Shared domain types for Ridge Run. */

export type VehicleId = "rally" | "moto" | "truck";

export type UpgradeKey = "engine" | "suspension" | "tires" | "fuel";

export interface Vec2 {
  x: number;
  y: number;
}

/** Levels are 1-based: 1 is factory spec, 10 is fully built. */
export interface UpgradeLevels {
  engine: number;
  suspension: number;
  tires: number;
  fuel: number;
}

export interface GameSave {
  best: number;
  coins: number;
  muted: boolean;
  selectedVehicle: VehicleId;
  unlockedVehicles: VehicleId[];
  upgrades: Record<VehicleId, UpgradeLevels>;
}

export interface VehicleConfig {
  id: VehicleId;
  number: string;
  name: string;
  englishName: string;
  tagline: string;
  blurb: string;
  accent: string;
  /** Rigid-body numbers used by the solver. */
  mass: number;
  inertia: number;
  wheelRadius: number;
  engineBase: number;
  /** Local X of each suspension contact point. */
  wheelPositions: number[];
  /** Local Y of every wheel hub. */
  wheelLocalY: number;
  /** Share of engine/brake force routed to each wheel (sums to 1). */
  wheelShares: number[];
  /** Airborne rotation torque. */
  rotTorque: number;
  unlockCoins: number;
  unlockBest: number;
  chassisPoints: Vec2[];
  roofPoints: Vec2[];
  displayLength: number;
  displayHeight: number;
}

export interface VehicleStats {
  engineFactor: number;
  springFactor: number;
  damperFactor: number;
  gripFactor: number;
  fuelCapacity: number;
  fuelBurnFactor: number;
}

export interface CarState {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  wheelSpin: number[];
  contact: boolean[];
  wheelWorld: Vec2[];
  contactCount: number;
  maxX: number;
  crashed: boolean;
  crashTimer: number;
}

export interface DriveInput {
  throttle: boolean;
  brake: boolean;
  gasHeld: boolean;
  brakeHeld: boolean;
  canDrive: boolean;
}

export interface BodyImpact {
  x: number;
  y: number;
  /** Impact speed along the surface normal. */
  strength: number;
}

export interface PhysicsEvents {
  wasGrounded: boolean;
  grounded: boolean;
  crashed: boolean;
  impacts: BodyImpact[];
}

export type JumpTier = 0 | 1 | 2 | 3;

export interface JumpState {
  airborne: boolean;
  duration: number;
  tier: JumpTier;
  flash: number;
  flashColor: string;
  landing: number;
  landingTier: JumpTier;
  calloutTime: number;
  calloutTier: JumpTier;
  calloutReward: number;
}

export type ImpactMode = "off" | "air" | "impact" | "crash";

export interface FrameFxState {
  mode: ImpactMode;
  airborne: boolean;
  tier: number;
  color: string;
  pulse: number;
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface ViewState {
  x: number;
  y: number;
  scale: number;
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  view: ViewState;
  time: number;
}

export interface Item {
  type: "coin" | "fuel";
  x: number;
  y: number;
  phase: number;
  alive: boolean;
}

export type ParticleType =
  | "dust"
  | "smoke"
  | "spark"
  | "streak"
  | "shockwave"
  | "coin";

export interface Particle {
  type: ParticleType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  length?: number;
  color?: string;
  radius?: number;
  phase?: number;
}

export interface HudSnapshot {
  distance: number;
  best: number;
  coins: number;
  runCoins: number;
  fuel: number;
  fuelCapacity: number;
  speed: number;
  playing: boolean;
  crashed: boolean;
}

export type RunEndReason = "fuel" | "crash";

export interface RunResult {
  distance: number;
  coins: number;
  best: number;
  record: boolean;
  reason: RunEndReason;
}

export type GameState = "intro" | "playing" | "paused" | "over";

export interface UpgradeDefinition {
  key: UpgradeKey;
  label: string;
  english: string;
  blurb: string;
  accent: string;
}
