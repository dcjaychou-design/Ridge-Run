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

export type RunMode = "standard" | "daily" | "challenge";

export type GhostMode = "standard" | "daily";

export type GhostKind = "pb" | "rival";

/**
 * A compressed run replay. `frames` stores `[x, y, angle]` triplets: the
 * first is absolute in quantised units (0.1 m / 0.01 rad), every later frame
 * stores the delta from the previous one. `stride` is how many 0.15 s sample
 * ticks each stored frame spans (1 for locally recorded runs).
 */
export interface GhostRecord {
  version: 1;
  mode: GhostMode;
  seed: number;
  dateKey?: string;
  vehicleId: VehicleId;
  distance: number;
  frames: number[];
  stride?: number;
}

export type MissionKind =
  | "distance"
  | "flips"
  | "perfect"
  | "coins"
  | "wheelie"
  | "stage";

export interface MissionState {
  id: string;
  kind: MissionKind;
  target: number;
  reward: number;
  progress: number;
  done: boolean;
}

export interface GameSave {
  best: number;
  coins: number;
  muted: boolean;
  cameraWidth: number;
  selectedVehicle: VehicleId;
  unlockedVehicles: VehicleId[];
  upgrades: Record<VehicleId, UpgradeLevels>;
  bestGhost: GhostRecord | null;
  dailyDate: string;
  dailyBest: number;
  dailyFirstClaimed: boolean;
  dailyGhost: GhostRecord | null;
  missions: MissionState[];
  completedMissions: number;
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
  /** Local exhaust / nitro nozzle anchor. */
  exhaustPoint: Vec2;
  /** Unit vector of the exhaust plume in vehicle space. */
  exhaustDir: Vec2;
  /** Local front headlight anchor used by the night beam. */
  headlightPoint: Vec2;
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

export interface PhysicsModifiers {
  /** Nitro raises thrust, raises the speed cap and lifts the cruise floor. */
  nitro: boolean;
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
  /** Signed net rotation accumulated during the current airborne phase. */
  airRotation: number;
  /** Full 360° flips already announced this airborne phase. */
  flipsCompleted: number;
  /** Seconds the current wheelie has been balanced. */
  wheelieTime: number;
  /** Per-second wheelie payout accumulator. */
  wheelieTick: number;
  /** Consecutive perfect landings, capped at 5. */
  perfectCombo: number;
  /** Remaining nitro boost seconds. */
  nitroTime: number;
  /** Remaining magnetic coin attraction seconds. */
  magnetTime: number;
  /** In-world stunt headline; empty falls back to the jump tier title. */
  stuntTitle: string;
  stuntSubtitle: string;
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
  stage: StageInfo;
  palette: BiomePalette;
}

export type ItemType = "coin" | "fuel" | "nitro" | "magnet";

export interface Item {
  type: ItemType;
  x: number;
  y: number;
  /** Velocity used by magnetic attraction; 0 for untouched items. */
  vx: number;
  vy: number;
  phase: number;
  alive: boolean;
}

export type ParticleType =
  | "dust"
  | "smoke"
  | "spark"
  | "streak"
  | "shockwave"
  | "coin"
  | "flame";

/* ---------- biomes / surface hazards ---------- */
export type BiomeId = "alpine" | "glacier" | "canyon" | "summit";
export type SurfaceKind = "ground" | "ice" | "mud";
export type DetailStyle = "pine" | "snow" | "rock" | "aurora";
export type AtmosphereMode = "mote" | "snow" | "sand" | "night";

/**
 * Flat, blendable palette for one 500 m stage. Every colour is a `#rrggbb`
 * string so two stages can be cross-faded with a plain channel lerp.
 */
export interface BiomePalette {
  skyTop: string;
  skyUpper: string;
  skyMid: string;
  skyLow: string;
  skyHorizon: string;
  skyBottom: string;
  sunGlow: string;
  sunCore: string;
  sunEdge: string;
  sunAlpha: number;
  starAlpha: number;
  cloudAlpha: number;
  aurora: number;
  birdAlpha: number;
  farTop: string;
  farBottom: string;
  midTop: string;
  midBottom: string;
  nearTop: string;
  nearBottom: string;
  crestColor: string;
  crestAlpha: number;
  treeColor: string;
  treeAlpha: number;
  snowCap: number;
  hazeColor: string;
  hazeAlpha: number;
  groundTop: string;
  groundUpper: string;
  groundMid: string;
  groundBottom: string;
  rim: string;
  rimHalo: string;
  rimSoft: string;
  strataColor: string;
  detailColor: string;
  rockColor: string;
  detailStyle: DetailStyle;
  atmosphere: AtmosphereMode;
  nightFactor: number;
}

export interface StageInfo {
  id: BiomeId;
  /** Local stage slot, 0–3. */
  index: number;
  cycle: number;
  globalStage: number;
  stageLabel: string;
  name: string;
  english: string;
  hint: string;
  accent: string;
}

export interface SurfaceState {
  kind: SurfaceKind;
  grip: number;
  rollingResistance: number;
  dragMultiplier: number;
}

export interface SurfacePatch {
  kind: "ice" | "mud";
  /** World X of the patch bounds. */
  start: number;
  end: number;
  stage: number;
}

export interface UpdraftVent {
  x: number;
  width: number;
  phase: number;
}

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
  stageLabel: string;
  stageName: string;
  stageAccent: string;
  nitro: number;
  magnet: number;
  combo: number;
}

export type RunEndReason = "fuel" | "crash";

export interface RunResult {
  distance: number;
  coins: number;
  best: number;
  record: boolean;
  reason: RunEndReason;
  mode: RunMode;
  challengeWin: boolean;
  rivalDistance: number;
  dailyRecord: boolean;
  highlightStunt: string;
  ghostOutcome: string;
  bounty: number;
}

export type GameState = "intro" | "playing" | "paused" | "over";

export interface UpgradeDefinition {
  key: UpgradeKey;
  label: string;
  english: string;
  blurb: string;
  accent: string;
}
