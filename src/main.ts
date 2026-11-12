import { AudioController } from "./audio/AudioController";
import {
  CAMERA_WIDTH_PRESETS,
  CAMERA_WIDTH_STEP,
  CHALLENGE_WIN_BOUNTY,
  CHUNK,
  CRASH_SETTLE_TIME,
  DEFAULT_CAMERA_WIDTH,
  FLIP_REWARD,
  FLIP_TOLERANCE,
  FUEL_PICKUP_AMOUNT,
  GHOST_MIN_OVERTAKE,
  GHOST_RADAR_RANGE,
  GOAL_STEP,
  JUMP_STAGES,
  LOW_FUEL_RATIO,
  MAGNET_DURATION,
  MAGNET_MAX_TIME,
  MAGNET_RADIUS,
  MAX_CAMERA_WIDTH,
  MAX_NITRO_TIME,
  MIN_CAMERA_WIDTH,
  NITRO_FLIP_TIME,
  NITRO_PERFECT_TIME,
  NITRO_PICKUP_TIME,
  PERFECT_ANGLE,
  PERFECT_MAX_COMBO,
  PERFECT_MIN_AIR,
  RESPAWN_FUEL_COST,
  STAGE_LENGTH,
  START_X,
  VEHICLES,
  WHEELIE_ANGLE,
  WHEELIE_INTERVAL,
  WHEELIE_MIN_SPEED,
  WHEELIE_REWARD,
  WHEELIE_START,
  deriveVehicleStats,
} from "./constants";
import {
  dailySeedFor,
  dailyVehicleFor,
  fairUpgrades,
  refreshDaily,
  seedHex,
  settleDaily,
  utcDateKey,
} from "./daily";
import {
  GhostPlayback,
  GhostRecorder,
  challengeFromHash,
  decodeChallengeCode,
  encodeGhostCode,
  ghostProgress,
} from "./ghost/GhostSystem";
import type { GhostPose } from "./ghost/GhostSystem";
import { MissionTracker, missionTitle } from "./missions";
import { LATEST_NOTICE_ID, NOTICES } from "./notices";
import {
  biomePaletteAt,
  stageInfoAt,
  surfaceAt,
} from "./physics/biomes";
import { VehiclePhysics } from "./physics/VehiclePhysics";
import {
  getWorldSeed,
  heightAt,
  setWorldSeed,
  slopeAt,
} from "./physics/terrain";
import { AtmosphereRenderer } from "./render/AtmosphereRenderer";
import { ItemRenderer } from "./render/ItemRenderer";
import { JumpFxRenderer } from "./render/JumpFxRenderer";
import { MountainRenderer } from "./render/MountainRenderer";
import { ParticleSystem } from "./render/ParticleSystem";
import { SkyRenderer } from "./render/SkyRenderer";
import { TerrainRenderer } from "./render/TerrainRenderer";
import { VehicleRenderer } from "./render/VehicleRenderer";
import { flushSave, loadSave, persistSave } from "./storage";
import type {
  CameraState,
  CarState,
  FrameFxState,
  GameState,
  GhostKind,
  GhostRecord,
  HudSnapshot,
  ImpactMode,
  Item,
  JumpState,
  JumpTier,
  NoticeCategory,
  NoticeEntry,
  RenderContext,
  RunEndReason,
  RunMode,
  RunResult,
  UpgradeLevels,
  VehicleId,
  VehicleStats,
  ViewState,
} from "./types";
import { GarageModal } from "./ui/GarageModal";
import { HudController, cameraWidthTag } from "./ui/HudController";
import { MissionBoard } from "./ui/MissionBoard";
import { Overlays } from "./ui/Overlays";
import { PosterGenerator } from "./ui/PosterGenerator";
import { byId } from "./ui/dom";
import { clamp, lerp, mulberry32, TAU } from "./utils";

/* ---------- canvas / state ---------- */
const canvas = byId<HTMLCanvasElement>("scene");
const context2d = canvas.getContext("2d", { alpha: false });
if (!context2d) throw new Error("Canvas 2D is unavailable");
const ctx: CanvasRenderingContext2D = context2d;

let W = 1;
let H = 1;
let DPR = 1;
let baseScale = 30;
let accumulator = 0;
let lastFrame = 0;
let elapsed = 0;
let shake = 0;
let state: GameState = "intro";

const camera: CameraState = { x: START_X, y: 0, scale: 30 };
const view: ViewState = { x: START_X, y: 0, scale: 30 };

const hud = new HudController();
const overlays = new Overlays();
const save = loadSave();
if (refreshDaily(save)) persistSave(save, true);

const missionTracker = new MissionTracker(save.missions);
const missionBoard = new MissionBoard();
const posterGenerator = new PosterGenerator();

let runMode: RunMode = "standard";
let loadedChallenge: GhostRecord | null = challengeFromHash(window.location.hash);
let runConfig: RunConfig = resolveRunConfig("standard");

const audio = new AudioController(save.muted, (muted) => {
  save.muted = muted;
  persistSave(save, true);
  hud.setMuted(muted);
});

const physics = new VehiclePhysics(VEHICLES[save.selectedVehicle]);
const car = physics.car;
let stats: VehicleStats = deriveVehicleStats(
  save.upgrades[save.selectedVehicle],
);

// The solver runs at 120 Hz; the renderer samples between the previous and
// current step so 120/144 Hz displays stay smooth.
const renderCar: CarState = {
  ...car,
  wheelSpin: car.wheelSpin,
  contact: car.contact,
  wheelWorld: car.wheelWorld,
};
const previousCar = { x: car.x, y: car.y, angle: car.angle, vx: car.vx };

/* ---------- run state ---------- */
let fuel = stats.fuelCapacity;
let runCoins = 0;
let distance = 0;
let emptyTimer = 0;
let emptyWarned = false;
let lowFuelWarned = false;
let stuckTimer = 0;
let exhaustTimer = 0;
let nitroExhaustTimer = 0;
let hasTouchedGround = false;
let chunkCursor = 0;
let items: Item[] = [];
let lastStageGlobal = 0;

interface RunConfig {
  seed: number;
  vehicleId: VehicleId;
  upgrades: UpgradeLevels;
  ghost: GhostRecord | null;
  ghostKind: GhostKind;
  recordMode: "standard" | "daily";
  dateKey?: string;
  modeLabel: string;
}

interface RunSummary {
  mode: RunMode;
  modeLabel: string;
  vehicleId: VehicleId;
  distance: number;
  record: boolean;
  dailyRecord: boolean;
  challengeWin: boolean;
  rivalDistance: number;
  bounty: number;
  flips: number;
  bestCombo: number;
  highestStunt: string;
  runCoins: number;
  seed: number;
  dateKey: string;
  stageCount: number;
  challengeCode: string;
}

const ghostRecorder = new GhostRecorder();
let activeGhost: { record: GhostRecord; kind: GhostKind } | null = null;
let ghostPlayback: GhostPlayback | null = null;
let ghostPose: GhostPose | null = null;
let ghostDelta = 0;
let ghostOvertaken = false;
let runTime = 0;
let lastSummary: RunSummary | null = null;
let posterReady = false;

let runFlips = 0;
let perfectLandings = 0;
let wheelieTotal = 0;
let coinsCollected = 0;
let bestCombo = 0;
let highestStunt = "";
let highestStuntScore = 0;
let missionEarnings = 0;
let missionSyncClock = 0;

const jump: JumpState = {
  airborne: false,
  duration: 0,
  tier: 0,
  flash: 0,
  flashColor: "#f0b15e",
  landing: 0,
  landingTier: 0,
  calloutTime: 0,
  calloutTier: 0,
  calloutReward: 0,
  airRotation: 0,
  flipsCompleted: 0,
  wheelieTime: 0,
  wheelieTick: 0,
  perfectCombo: 0,
  nitroTime: 0,
  magnetTime: 0,
  stuntTitle: "",
  stuntSubtitle: "",
};

const frameFx: FrameFxState = {
  mode: "off",
  airborne: false,
  tier: 0,
  color: "#f0b15e",
  pulse: 0,
};

/* ---------- renderers ---------- */
const skyRenderer = new SkyRenderer();
const mountainRenderer = new MountainRenderer();
const terrainRenderer = new TerrainRenderer();
const itemRenderer = new ItemRenderer();
const vehicleRenderer = new VehicleRenderer();
const jumpFxRenderer = new JumpFxRenderer();
const atmosphereRenderer = new AtmosphereRenderer();
const particles = new ParticleSystem();

/* ---------- input ---------- */
const keys: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
const touch = { gas: false, brake: false };

function readGas(): boolean {
  return !!(keys["ArrowRight"] || keys["KeyD"] || keys["Space"] || touch.gas);
}

function readBrake(): boolean {
  return !!(keys["ArrowLeft"] || keys["KeyA"] || touch.brake);
}

function clearPressed(): void {
  touch.gas = false;
  touch.brake = false;
  for (const key of Object.keys(keys)) keys[key] = false;
  byId("gasBtn").classList.remove("is-pressed");
  byId("brakeBtn").classList.remove("is-pressed");
}

/* ---------- camera ---------- */
function computeBaseScale(width: number, cameraWidth: number): number {
  const targetWidth = clamp(
    Math.round(cameraWidth),
    MIN_CAMERA_WIDTH,
    MAX_CAMERA_WIDTH,
  );
  // 默认可视宽度进一步拉近至 36 世界单位（上限 58 保证 2K/超宽屏同步拉近），并按用户设定比例联动上下限
  const zoomRatio = DEFAULT_CAMERA_WIDTH / targetWidth;
  return clamp(width / targetWidth, 16 * zoomRatio, 58 * zoomRatio);
}

function resize(): void {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(W * DPR));
  canvas.height = Math.max(1, Math.floor(H * DPR));
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  baseScale = computeBaseScale(W, save.cameraWidth);
  if (state === "intro") camera.scale = baseScale * 1.015;
}

function setCameraWidth(
  nextWidth: number,
  options: { announce?: boolean; sound?: boolean } = {},
): void {
  const clamped = clamp(
    Math.round(nextWidth),
    MIN_CAMERA_WIDTH,
    MAX_CAMERA_WIDTH,
  );
  const changed = clamped !== save.cameraWidth;
  save.cameraWidth = clamped;
  baseScale = computeBaseScale(W, clamped);
  hud.setCameraWidth(clamped);
  persistSave(save);
  if (options.sound && changed) {
    audio.ensure();
    audio.select();
  }
  if (options.announce) {
    hud.showToast(
      `镜头视野 · ${clamped}m`,
      `${cameraWidthTag(clamped)} · 按 [ / ] 可随时微调`,
    );
  }
}

function stepCameraWidth(delta: number): void {
  const next = clamp(
    save.cameraWidth + delta,
    MIN_CAMERA_WIDTH,
    MAX_CAMERA_WIDTH,
  );
  if (next === save.cameraWidth) {
    audio.ensure();
    audio.deny();
    hud.showToast(
      `镜头视野 · ${next}m`,
      delta < 0 ? "已达最近视野下限" : "已达最远视野上限",
    );
    return;
  }
  setCameraWidth(next, { announce: true, sound: true });
}

function cycleCameraPreset(): void {
  const current = save.cameraWidth;
  let nextIndex = CAMERA_WIDTH_PRESETS.findIndex((preset) => preset > current);
  if (nextIndex < 0) nextIndex = 0;
  const next = CAMERA_WIDTH_PRESETS[nextIndex]!;
  setCameraWidth(next, { announce: true, sound: true });
}

function targetCamera(): CameraState {
  const visW = W / camera.scale;
  const visH = H / camera.scale;
  if (state === "intro") {
    return {
      x: renderCar.x - visW * 0.18,
      y: renderCar.y - visH * 0.15,
      scale: baseScale * 1.015,
    };
  }
  const look = clamp(renderCar.vx * 0.4, -visW * 0.17, visW * 0.22);
  const speedZoom = 1 - clamp(Math.abs(renderCar.vx) / 92, 0, 0.1);
  const nitroZoom =
    jump.nitroTime > 0 && !renderCar.crashed ? 0.94 : 1;
  return {
    x: renderCar.x + look,
    y: renderCar.y - visH * 0.13,
    scale: baseScale * speedZoom * nitroZoom,
  };
}

function updateCamera(dt: number): void {
  const target = targetCamera();
  const posK = 1 - Math.exp(-dt * (state === "intro" ? 1.25 : 4.4));
  const scaleK = 1 - Math.exp(-dt * 2.3);
  camera.x = lerp(camera.x, target.x, posK);
  camera.y = lerp(camera.y, target.y, posK);
  camera.scale = lerp(camera.scale, target.scale, scaleK);
  shake *= Math.exp(-dt * 6.5);
  if (shake < 0.001) shake = 0;
}

function snapCamera(): void {
  const target = targetCamera();
  camera.x = target.x;
  camera.y = target.y;
  camera.scale = target.scale;
}

function makeView(time: number): void {
  view.x = camera.x + (Math.sin(time * 137) * shake * 6.5) / camera.scale;
  view.y = camera.y + (Math.cos(time * 107) * shake * 4.5) / camera.scale;
  view.scale = camera.scale;
}

function addShake(value: number): void {
  shake = Math.min(2.6, shake + value);
}

/** Drop both interpolation endpoints onto the current solver state. */
function snapVisualCar(): void {
  previousCar.x = car.x;
  previousCar.y = car.y;
  previousCar.angle = car.angle;
  previousCar.vx = car.vx;
  renderCar.x = car.x;
  renderCar.y = car.y;
  renderCar.angle = car.angle;
  renderCar.vx = car.vx;
  renderCar.vy = car.vy;
  renderCar.omega = car.omega;
  renderCar.crashed = car.crashed;
  renderCar.crashTimer = car.crashTimer;
  renderCar.contactCount = car.contactCount;
  renderCar.maxX = car.maxX;
  renderCar.wheelSpin = car.wheelSpin;
  renderCar.contact = car.contact;
  renderCar.wheelWorld = car.wheelWorld;
}

/** Render sample = previous step + alpha × current step. */
function syncRenderCar(): void {
  if (state !== "playing") {
    snapVisualCar();
    return;
  }
  const alpha = clamp(accumulator / GOAL_STEP, 0, 1);
  renderCar.x = lerp(previousCar.x, car.x, alpha);
  renderCar.y = lerp(previousCar.y, car.y, alpha);
  renderCar.angle = lerp(previousCar.angle, car.angle, alpha);
  renderCar.vx = lerp(previousCar.vx, car.vx, alpha);
  renderCar.vy = car.vy;
  renderCar.omega = car.omega;
  renderCar.crashed = car.crashed;
  renderCar.crashTimer = car.crashTimer;
  renderCar.contactCount = car.contactCount;
  renderCar.maxX = car.maxX;
  renderCar.wheelSpin = car.wheelSpin;
  renderCar.contact = car.contact;
  renderCar.wheelWorld = car.wheelWorld;
}

/* ---------- items ---------- */
function generateChunk(chunk: number): void {
  const rng = mulberry32(
    (((chunk + 7) * 0x9e3779b1) ^ getWorldSeed()) >>> 0,
  );
  const baseX = START_X + chunk * CHUNK;
  let coinStart = Number.POSITIVE_INFINITY;
  let fuelX = Number.POSITIVE_INFINITY;

  if (chunk % 2 === 1) {
    const count = 3 + Math.floor(rng() * 3);
    const start = baseX + 7 + rng() * 15;
    coinStart = start;
    const lift = 1.08 + rng() * 0.5;
    for (let i = 0; i < count; i++) {
      const x = start + i * 3.15;
      const arc = Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 1.55;
      items.push({
        type: "coin",
        x,
        y: heightAt(x) - lift - arc,
        vx: 0,
        vy: 0,
        phase: rng() * TAU,
        alive: true,
      });
    }
  }

  if (chunk === 1 || (chunk > 3 && chunk % 4 === 1)) {
    const x = baseX + 13 + rng() * 17;
    fuelX = x;
    items.push({
      type: "fuel",
      x,
      y: heightAt(x) - 1.15,
      vx: 0,
      vy: 0,
      phase: rng() * TAU,
      alive: true,
    });
  }

  // Turbo cylinder: from the 2nd chunk onward, in the climb-in section.
  if (chunk >= 1 && rng() < 0.35) {
    const x = baseX + 4 + rng() * 11;
    if (Math.abs(x - fuelX) > 5.5) {
      items.push({
        type: "nitro",
        x,
        y: heightAt(x) - 1.2,
        vx: 0,
        vy: 0,
        phase: rng() * TAU,
        alive: true,
      });
    }
  }

  // Magnet beacon: just ahead of a coin ribbon, so it charges before the arc.
  if (Number.isFinite(coinStart) && rng() < 0.25) {
    const x = Math.max(baseX + 3, coinStart - 8 - rng() * 4);
    if (Math.abs(x - fuelX) > 5.5) {
      items.push({
        type: "magnet",
        x,
        y: heightAt(x) - 1.55,
        vx: 0,
        vy: 0,
        phase: rng() * TAU,
        alive: true,
      });
    }
  }
}

function ensureChunksAhead(): void {
  const target = car.x + 310;
  while (START_X + chunkCursor * CHUNK < target) {
    generateChunk(chunkCursor);
    chunkCursor++;
  }
  if (items.length > 500) {
    items = items.filter((item) => item.alive && item.x > car.x - 55);
  }
}

/* ---------- effects ---------- */
function setFrameFx(
  mode: ImpactMode,
  tier: number,
  color: string,
  pulse: number,
): void {
  frameFx.mode = mode;
  frameFx.airborne = mode === "air";
  frameFx.tier = tier;
  frameFx.color = color;
  frameFx.pulse = pulse;
  hud.syncImpactFrame(frameFx);
}

function beginJump(): void {
  jump.airborne = true;
  jump.duration = 0;
  jump.tier = 0;
  jump.airRotation = 0;
  jump.flipsCompleted = 0;
  jump.wheelieTime = 0;
  jump.wheelieTick = 0;
  jump.calloutTime = 0;
  jump.stuntTitle = "";
  jump.stuntSubtitle = "";
  jump.flash = 0.46;
  jump.flashColor = "#f0b15e";
  jump.landing = 0;
  setFrameFx("air", 0, "#f0b15e", 0.48);
  addShake(0.38);
  particles.spawnShockwave(car.x, car.y + 0.45, "#f0b15e", 3.4);
  particles.spawnJumpBurst(car.x, car.y, 1, "#f0b15e");
  particles.spawnDust(car.x - 0.8, heightAt(car.x - 0.8), -1, car.vx);
  particles.spawnDust(car.x + 0.8, heightAt(car.x + 0.8), 1, car.vx);
  audio.takeoff();
  hud.showToast("腾空", "稳住车身，跨越飞跃门槛");
}

function triggerJumpTier(tier: JumpTier): void {
  const stage = JUMP_STAGES[tier - 1]!;
  const scale = tier === 3 ? 1.6 : tier === 2 ? 1.25 : 1;
  jump.tier = tier;
  jump.flash = 0.25 + tier * 0.12;
  jump.flashColor = stage.color;
  jump.calloutTime = 1.05;
  jump.calloutTier = tier;
  jump.calloutReward = 0;
  jump.stuntTitle = "";
  jump.stuntSubtitle = "";
  setFrameFx("air", tier, stage.color, 0.58);
  addShake(0.36 * scale);
  particles.spawnShockwave(car.x, car.y, stage.color, 3.6 + tier * 1.8);
  particles.spawnJumpBurst(car.x, car.y, tier, stage.color);
  audio.jump(tier);
  hud.showToast(stage.title, `落地结算 +${stage.reward} 金币`);
}

function triggerFlip(totalFlips: number): void {
  jump.flash = 0.24;
  jump.flashColor = "#ffe9a8";
  setFrameFx("air", Math.min(3, totalFlips + 1) as JumpTier, "#ffe9a8", 0.68);
  addShake(0.34);
  particles.spawnShockwave(
    car.x,
    car.y,
    "#ffe9a8",
    3.8 + totalFlips * 1.4,
  );
  particles.spawnJumpBurst(
    car.x,
    car.y,
    Math.min(3, totalFlips + 1),
    "#ffe9a8",
  );
  audio.flip();
}

function grantCoins(amount: number): void {
  if (amount <= 0) return;
  runCoins += amount;
  save.coins += amount;
  persistSave(save);
  hud.bumpCoins();
}

function finishJump(): void {
  const tier = jump.tier;
  const stage = tier ? JUMP_STAGES[(tier - 1) as number]! : null;
  const baseColor = stage ? stage.color : "#f0b15e";
  const duration = jump.duration;
  const flips = jump.flipsCompleted;
  const airRotation = jump.airRotation;

  jump.airborne = false;
  jump.landing = tier ? 0.86 : 0.34;
  jump.landingTier = tier;
  jump.flash = tier ? 0.24 : 0.1;
  jump.calloutTime = tier ? 1.2 : 0;
  jump.calloutTier = tier;
  jump.wheelieTime = 0;
  jump.wheelieTick = 0;

  let reward = 0;
  let flashColor = baseColor;
  const details: string[] = [];
  let toastMain = "";

  if (stage) {
    reward += stage.reward;
    toastMain = `${stage.title} +${stage.reward}`;
  }

  if (!car.crashed) {
    const jumpScore = tier * 2;
    if (jumpScore > highestStuntScore) {
      highestStuntScore = jumpScore;
      highestStunt = stage ? stage.title : "";
    }

    if (flips > 0) {
      const flipReward = FLIP_REWARD * flips;
      reward += flipReward;
      runFlips += flips;
      jump.nitroTime = Math.min(
        MAX_NITRO_TIME,
        jump.nitroTime + NITRO_FLIP_TIME,
      );
      const direction = airRotation > 0 ? "前空翻" : "后空翻";
      const stuntScore = flips * 8 + tier;
      if (stuntScore > highestStuntScore) {
        highestStuntScore = stuntScore;
        highestStunt = `${direction} ×${flips}`;
      }
      toastMain = `${direction} ×${flips} · +${flipReward} 金币`;
      jump.stuntTitle = `${direction} ×${flips}`;
      jump.stuntSubtitle = `+${flipReward} 金币 · 氮气 +${NITRO_FLIP_TIME.toFixed(1)}s`;
      details.push(`落地补发氮气 +${NITRO_FLIP_TIME.toFixed(1)}s`);
      particles.spawnCoinReward(
        car.x,
        car.y - 0.7,
        Math.min(16, flipReward),
      );
      particles.spawnShockwave(car.x, car.y, "#ffe9a8", 4.8 + flips * 1.4);
    }

    const slopeAngle = Math.atan(slopeAt(car.x));
    const angleDiff = Math.abs(
      Math.atan2(
        Math.sin(car.angle - slopeAngle),
        Math.cos(car.angle - slopeAngle),
      ),
    );
    if (duration >= PERFECT_MIN_AIR) {
      if (angleDiff < PERFECT_ANGLE) {
        jump.perfectCombo = Math.min(
          PERFECT_MAX_COMBO,
          jump.perfectCombo + 1,
        );
        perfectLandings += 1;
        bestCombo = Math.max(bestCombo, jump.perfectCombo);
        const perfectReward = 5 * jump.perfectCombo;
        reward += perfectReward;
        jump.nitroTime = Math.min(
          MAX_NITRO_TIME,
          jump.nitroTime + NITRO_PERFECT_TIME,
        );
        car.vx += 1.2;
        toastMain = toastMain
          ? `${toastMain} · 完美落地 ×${jump.perfectCombo}`
          : `完美落地 ×${jump.perfectCombo}`;
        if (jump.stuntTitle) {
          jump.stuntSubtitle = `${jump.stuntSubtitle} · 完美落地 ×${jump.perfectCombo}`;
        } else {
          jump.stuntTitle = `完美落地 ×${jump.perfectCombo}`;
          jump.stuntSubtitle = `+${perfectReward} 金币 · 氮气充能`;
        }
        details.push(`+${perfectReward} 金币 · 氮气充能`);
        flashColor = "#89d8c8";
        particles.spawnShockwave(
          car.x,
          heightAt(car.x) - 0.04,
          "#89d8c8",
          4.4 + jump.perfectCombo * 0.9,
        );
        audio.nitro();
        addShake(0.3);
      } else {
        jump.perfectCombo = 0;
      }
    }
  }

  jump.flashColor = flashColor;
  jump.calloutReward = reward;
  setFrameFx(
    "impact",
    tier,
    flashColor,
    tier === 3 ? 1.3 : tier === 2 ? 1.05 : tier === 1 ? 0.72 : 0.34,
  );
  particles.spawnShockwave(
    car.x,
    heightAt(car.x) - 0.04,
    flashColor,
    tier ? 4 + tier * 2.2 : 2.6,
  );
  particles.spawnLandingBurst(car.x, heightAt(car.x), tier, flashColor);
  addShake(tier === 3 ? 1.12 : tier === 2 ? 0.78 : tier === 1 ? 0.48 : 0.22);
  audio.landing(tier);

  if (reward > 0) {
    grantCoins(reward);
    particles.spawnCoinReward(car.x, car.y - 0.7, Math.min(20, reward));
    audio.coinPickup(runCoins);
    hud.showToast(toastMain, details.join(" · ") || "金币已入账");
  }

  jump.duration = 0;
  jump.tier = 0;
  jump.airRotation = 0;
  jump.flipsCompleted = 0;
}

function collectItem(item: Item): void {
  item.alive = false;
  if (item.type === "coin") {
    runCoins++;
    coinsCollected++;
    save.coins++;
    persistSave(save);
    audio.coinPickup(runCoins);
    particles.spawnPickup(item.x, item.y, "#f4c76d");
    hud.bumpCoins();
    return;
  }
  if (item.type === "fuel") {
    fuel = Math.min(stats.fuelCapacity, fuel + FUEL_PICKUP_AMOUNT);
    emptyTimer = 0;
    emptyWarned = false;
    lowFuelWarned = false;
    audio.fuelPickup();
    particles.spawnPickup(item.x, item.y, "#ffd08a");
    hud.showToast(`燃油 +${FUEL_PICKUP_AMOUNT}`, "继续向山脊深处");
    return;
  }
  if (item.type === "nitro") {
    jump.nitroTime = Math.min(
      MAX_NITRO_TIME,
      jump.nitroTime + NITRO_PICKUP_TIME,
    );
    audio.nitro();
    particles.spawnPickup(item.x, item.y, "#89d8c8");
    particles.spawnShockwave(item.x, item.y, "#89d8c8", 2.6);
    addShake(0.18);
    hud.showToast("涡轮充能", `强力推进 · NITRO ${NITRO_PICKUP_TIME.toFixed(1)}s`);
    return;
  }
  jump.magnetTime = Math.min(
    MAGNET_MAX_TIME,
    jump.magnetTime + MAGNET_DURATION,
  );
  audio.magnet();
  particles.spawnPickup(item.x, item.y, "#f0b15e");
  particles.spawnShockwave(item.x, item.y, "#f0b15e", 3.2);
  addShake(0.22);
  hud.showToast("磁铁信标", `引力场展开 · ${MAGNET_DURATION.toFixed(0)}s`);
}

function pickupRadius(type: Item["type"]): number {
  if (type === "fuel") return 1.95;
  if (type === "coin") return 1.55;
  return 1.9;
}

function updateItems(dt: number): void {
  const magnetActive = jump.magnetTime > 0 && !car.crashed;
  let pruned = false;
  for (const item of items) {
    if (!item.alive) {
      pruned = true;
      continue;
    }
    if (item.x < car.x - 60) {
      item.alive = false;
      pruned = true;
      continue;
    }
    if (!car.crashed) {
      if (magnetActive && item.type === "coin") {
        const dx = car.x - item.x;
        const dy = car.y - item.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MAGNET_RADIUS && dist > 0.001) {
          const pull = 30 + (MAGNET_RADIUS - dist) * 8;
          const k = 1 - Math.exp(-dt * 10);
          item.vx += ((dx / dist) * pull - item.vx) * k;
          item.vy += ((dy / dist) * pull - item.vy) * k;
        }
      }
      if (item.vx !== 0 || item.vy !== 0) {
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        const damp = Math.exp(-dt * 1.8);
        item.vx *= damp;
        item.vy *= damp;
      }
      const dx = item.x - car.x;
      const dy = item.y - car.y;
      const radius = pickupRadius(item.type);
      if (dx * dx + dy * dy < radius * radius) collectItem(item);
    }
  }
  if (pruned && Math.random() < 0.06) {
    items = items.filter((item) => item.alive);
  }
}

/* ---------- run lifecycle ---------- */
function dailyContext(): {
  dateKey: string;
  seed: number;
  vehicleId: VehicleId;
} {
  if (refreshDaily(save)) persistSave(save, true);
  const seed = dailySeedFor(save.dailyDate);
  return {
    dateKey: save.dailyDate,
    seed,
    vehicleId: dailyVehicleFor(seed),
  };
}

function resolveRunConfig(mode: RunMode): RunConfig {
  if (mode === "daily") {
    const context = dailyContext();
    const config = VEHICLES[context.vehicleId];
    return {
      seed: context.seed,
      vehicleId: context.vehicleId,
      upgrades: fairUpgrades(),
      ghost: save.dailyGhost,
      ghostKind: "pb",
      recordMode: "daily",
      dateKey: context.dateKey,
      modeLabel: `每日试炼 · #${config.number} ${config.name}`,
    };
  }
  if (mode === "challenge" && loadedChallenge) {
    const ghost = loadedChallenge;
    const daily = ghost.mode === "daily";
    const vehicleId = daily
      ? dailyVehicleFor(ghost.seed)
      : save.selectedVehicle;
    const config = VEHICLES[vehicleId];
    return {
      seed: ghost.seed,
      vehicleId,
      upgrades: daily ? fairUpgrades() : save.upgrades[vehicleId],
      ghost,
      ghostKind: "rival",
      recordMode: daily ? "daily" : "standard",
      dateKey: daily ? ghost.dateKey : undefined,
      modeLabel: `战书挑战 · #${config.number} · 目标 ${ghost.distance}m`,
    };
  }
  return {
    seed: 0,
    vehicleId: save.selectedVehicle,
    upgrades: save.upgrades[save.selectedVehicle],
    ghost: save.bestGhost,
    ghostKind: "pb",
    recordMode: "standard",
    modeLabel: "",
  };
}

function resetRun(): void {
  const config = VEHICLES[runConfig.vehicleId];
  stats = deriveVehicleStats(runConfig.upgrades);
  setWorldSeed(runConfig.seed);
  physics.setVehicle(config);
  physics.reset();

  fuel = stats.fuelCapacity;
  runCoins = 0;
  distance = 0;
  emptyTimer = 0;
  emptyWarned = false;
  lowFuelWarned = false;
  stuckTimer = 0;
  exhaustTimer = 0;
  nitroExhaustTimer = 0;
  hasTouchedGround = false;
  lastStageGlobal = 0;

  jump.airborne = false;
  jump.duration = 0;
  jump.tier = 0;
  jump.flash = 0;
  jump.flashColor = "#f0b15e";
  jump.landing = 0;
  jump.landingTier = 0;
  jump.calloutTime = 0;
  jump.calloutTier = 0;
  jump.calloutReward = 0;
  jump.airRotation = 0;
  jump.flipsCompleted = 0;
  jump.wheelieTime = 0;
  jump.wheelieTick = 0;
  jump.perfectCombo = 0;
  jump.nitroTime = 0;
  jump.magnetTime = 0;
  jump.stuntTitle = "";
  jump.stuntSubtitle = "";
  frameFx.mode = "off";
  frameFx.airborne = false;
  frameFx.tier = 0;
  frameFx.color = "#f0b15e";
  frameFx.pulse = 0;
  hud.syncImpactFrame(frameFx);
  shake = 0;

  runTime = 0;
  runFlips = 0;
  perfectLandings = 0;
  wheelieTotal = 0;
  coinsCollected = 0;
  bestCombo = 0;
  highestStunt = "";
  highestStuntScore = 0;
  missionEarnings = 0;
  missionSyncClock = 0;
  ghostOvertaken = false;
  ghostDelta = 0;
  ghostPose = null;
  activeGhost = runConfig.ghost
    ? { record: runConfig.ghost, kind: runConfig.ghostKind }
    : null;
  ghostPlayback = activeGhost ? new GhostPlayback(activeGhost.record) : null;
  ghostRecorder.reset({
    mode: runConfig.recordMode,
    seed: runConfig.seed,
    dateKey: runConfig.dateKey,
    vehicleId: runConfig.vehicleId,
  });
  missionTracker.reset();

  items = [];
  particles.clear();
  chunkCursor = 0;
  ensureChunksAhead();
  snapVisualCar();
  hud.setModeChip(
    runMode === "standard" ? "" : runConfig.modeLabel,
    runMode,
  );
  hud.update(snapshot(), true);
  missionBoard.sync(save.missions, true);
}

function snapshot(): HudSnapshot {
  const stage = stageInfoAt(distance);
  return {
    distance,
    best: runMode === "daily" ? save.dailyBest : save.best,
    coins: save.coins,
    runCoins,
    fuel,
    fuelCapacity: stats.fuelCapacity,
    speed: car.vx,
    playing: state === "playing",
    crashed: car.crashed,
    stageLabel: stage.stageLabel,
    stageName: stage.name,
    stageAccent: stage.accent,
    nitro: jump.nitroTime,
    magnet: jump.magnetTime,
    combo: jump.perfectCombo,
  };
}

function startRun(mode: RunMode = runMode): void {
  if (mode === "challenge" && !loadedChallenge) {
    audio.deny();
    hud.showToast("尚无战书", "先在首页载入好友的挑战码");
    return;
  }
  runMode = mode;
  runConfig = resolveRunConfig(mode);
  if (garage.isOpen) garage.close();
  audio.ensure();
  overlays.hideAll();
  overlays.hideNotice();
  resetRun();
  state = "playing";
  clearPressed();
  accumulator = 0;
  hud.setMode("playing");
  hud.setModeChip(runConfig.modeLabel, mode);
  hud.update(snapshot(), true);
  missionBoard.sync(save.missions, true);

  const config = VEHICLES[runConfig.vehicleId];
  if (mode === "daily") {
    audio.dailyStart();
    hud.showToast(
      "每日试炼发车",
      `${save.dailyDate} · #${config.number} ${config.name} · Lv.5 公平规格`,
    );
  } else if (mode === "challenge" && loadedChallenge) {
    hud.showToast(
      "战书应战",
      `目标 ${loadedChallenge.distance}m · 相同种子 ${seedHex(loadedChallenge.seed)}`,
    );
  } else if (runConfig.ghost) {
    hud.showToast(
      "发车",
      `PB 幽灵 · ${runConfig.ghost.distance}m 同屏陪跑`,
    );
  } else {
    hud.showToast("发车", "按住油门，向山脊进发");
  }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function pauseGame(): void {
  if (state !== "playing") return;
  state = "paused";
  clearPressed();
  hud.hideToast();
  hud.setMode("paused");
  missionBoard.sync(save.missions, true);
  overlays.showPause({
    distance,
    coins: runCoins,
    fuelPercent: Math.ceil((fuel / stats.fuelCapacity) * 100),
  });
}

function resumeGame(): void {
  if (state !== "paused") return;
  state = "playing";
  overlays.hidePause();
  hud.setMode("playing");
  accumulator = 0;
  audio.ensure();
}

function endRun(reason: RunEndReason): void {
  if (state !== "playing") return;
  const finalDistance = Math.floor(distance);
  const mode = runMode;
  let record = false;
  let dailyRecord = false;
  let challengeWin = false;
  let endBounty = 0;

  if (mode === "standard") {
    record = finalDistance > save.best;
    if (record) save.best = finalDistance;
  } else if (mode === "daily") {
    const settlement = settleDaily(save, finalDistance);
    dailyRecord = settlement.dailyRecord;
    endBounty += settlement.bounty;
    record = dailyRecord;
  } else if (mode === "challenge" && activeGhost) {
    challengeWin = finalDistance > activeGhost.record.distance;
    if (challengeWin) endBounty += CHALLENGE_WIN_BOUNTY;
  }

  const finishedGhost = ghostRecorder.finish(
    finalDistance,
    car.x,
    car.y,
    car.angle,
  );
  if (finishedGhost) {
    if (mode === "standard" && record) save.bestGhost = finishedGhost;
    if (mode === "daily" && dailyRecord) save.dailyGhost = finishedGhost;
  }

  const completedMissions = save.missions.filter(
    (mission) => mission.done,
  ).length;
  if (completedMissions > 0) save.completedMissions += completedMissions;
  missionTracker.rotate(save.completedMissions);

  if (endBounty > 0) {
    grantCoins(endBounty);
    if (challengeWin) audio.challengeWin();
    else audio.mission();
  }

  let rivalDistance = 0;
  let ghostOutcome = "—";
  if (activeGhost) {
    rivalDistance = activeGhost.record.distance;
    const diff = finalDistance - rivalDistance;
    ghostOutcome =
      diff > 0
        ? `领先 ${diff}m`
        : diff < 0
          ? `落后 ${Math.abs(diff)}m`
          : "并驾齐驱";
  }

  const resultBest = mode === "daily" ? save.dailyBest : save.best;
  const bountyTotal = missionEarnings + endBounty;
  lastSummary = {
    mode,
    modeLabel: runConfig.modeLabel || "STANDARD RUN",
    vehicleId: runConfig.vehicleId,
    distance: finalDistance,
    record,
    dailyRecord,
    challengeWin,
    rivalDistance,
    bounty: bountyTotal,
    flips: runFlips,
    bestCombo,
    highestStunt,
    runCoins,
    seed: runConfig.seed,
    dateKey: runConfig.dateKey ?? utcDateKey(),
    stageCount: Math.min(
      4,
      Math.floor(finalDistance / STAGE_LENGTH) + 1,
    ),
    challengeCode:
      finishedGhost && finalDistance >= 1
        ? encodeGhostCode(finishedGhost)
        : "",
  };

  // Prepare the next "again" run. Daily re-rolls automatically at UTC midnight.
  if (mode === "standard") runConfig = resolveRunConfig("standard");
  else if (mode === "daily") runConfig = resolveRunConfig("daily");

  persistSave(save, true);

  state = "over";
  clearPressed();
  hud.setMode("over");
  hud.updateMeta(save.best, save.coins);
  hud.update(snapshot(), true);
  const result: RunResult = {
    distance: finalDistance,
    coins: runCoins,
    best: resultBest,
    record,
    reason,
    mode,
    challengeWin,
    rivalDistance,
    dailyRecord,
    highlightStunt: highestStunt,
    ghostOutcome,
    bounty: bountyTotal,
  };
  hud.hideToast();
  overlays.showResult(result);
  missionBoard.sync(save.missions, true);
}

function goHome(): void {
  if (garage.isOpen) garage.close();
  state = "intro";
  runMode = "standard";
  if (refreshDaily(save)) persistSave(save, true);
  runConfig = resolveRunConfig("standard");
  lastSummary = null;
  clearPressed();
  overlays.hidePause();
  overlays.hideResult();
  overlays.hidePoster();
  overlays.hideChallenge();
  overlays.hideNotice();
  hud.setMode("intro");
  hud.setModeChip("", "standard");
  hud.updateMeta(save.best, save.coins);
  hud.update(snapshot(), true);
  overlays.showIntro();
  updateModeUi();
  resetRun();
  snapCamera();
  missionBoard.sync(save.missions, true);
}

function respawn(auto: boolean): void {
  const targetX = Math.max(START_X + 3, car.maxX - 7);
  physics.teleportTo(targetX);
  stuckTimer = 0;
  fuel = Math.max(5, fuel - RESPAWN_FUEL_COST);
  jump.airborne = false;
  jump.duration = 0;
  jump.tier = 0;
  jump.flash = 0;
  jump.landing = 0;
  jump.landingTier = 0;
  jump.calloutTime = 0;
  jump.calloutTier = 0;
  jump.calloutReward = 0;
  jump.airRotation = 0;
  jump.flipsCompleted = 0;
  jump.wheelieTime = 0;
  jump.wheelieTick = 0;
  jump.stuntTitle = "";
  jump.stuntSubtitle = "";
  setFrameFx("off", 0, "#f0b15e", 0);
  hasTouchedGround = false;
  snapVisualCar();
  addShake(auto ? 0.45 : 0.28);
  hud.showToast("脱困整备", `消耗 ${RESPAWN_FUEL_COST}% 燃油 · 退回安全坡面`);
}

/** Front wheel up, rear wheel down, nose held above the local slope. */
function updateWheelie(dt: number): void {
  const frontContact = car.contact[car.contact.length - 1] === true;
  const rearContact = car.contact[0] === true;
  const slopeAngle = Math.atan(slopeAt(car.x));
  const pitch = slopeAngle - car.angle;
  const balancing =
    !car.crashed &&
    !jump.airborne &&
    car.contactCount > 0 &&
    Math.abs(car.vx) > WHEELIE_MIN_SPEED &&
    !frontContact &&
    rearContact &&
    pitch > WHEELIE_ANGLE;

  if (!balancing) {
    jump.wheelieTime = 0;
    jump.wheelieTick = 0;
    return;
  }

  jump.wheelieTime += dt;
  wheelieTotal += dt;
  if (jump.wheelieTime < WHEELIE_START) return;
  jump.wheelieTick += dt;
  if (jump.wheelieTick < WHEELIE_INTERVAL) return;
  jump.wheelieTick -= WHEELIE_INTERVAL;
  grantCoins(WHEELIE_REWARD);
  const rear = car.wheelWorld[0]!;
  particles.spawnWheelieSpark(rear.x, heightAt(rear.x));
  audio.coinPickup(runCoins);
  hud.showToast(`单轮平衡 +${WHEELIE_REWARD}`, "后轮着地摩擦火花");
}

function updateGhost(): void {
  if (!activeGhost || !ghostPlayback) return;
  const pose = ghostPlayback.sample(runTime);
  ghostPose = pose;
  ghostDelta = distance - ghostProgress(activeGhost.record, pose);
  if (
    !ghostOvertaken &&
    activeGhost.record.distance >= GHOST_MIN_OVERTAKE &&
    distance >= activeGhost.record.distance
  ) {
    ghostOvertaken = true;
    triggerGhostOvertake();
  }
}

function triggerGhostOvertake(): void {
  const kind = activeGhost?.kind ?? "pb";
  const color = kind === "pb" ? "#89d8c8" : "#f0b15e";
  const target = activeGhost?.record.distance ?? 0;
  audio.overtake();
  addShake(0.6);
  particles.spawnShockwave(car.x, car.y, color, 6.2);
  particles.spawnShockwave(car.x, car.y, "#fff0bd", 4.4);
  particles.spawnJumpBurst(car.x, car.y, 3, "#fff0bd");
  hud.showToast(
    "超越目标 · 刷新山脊领跑线！",
    `${kind === "pb" ? "PB" : "RIVAL"} ${target}m 已甩在身后`,
  );
}

function updateMissions(dt: number): void {
  const completed = missionTracker.update({
    distance,
    flips: runFlips,
    perfect: perfectLandings,
    coins: coinsCollected,
    wheelie: wheelieTotal,
    stage: distance,
  });
  for (const mission of completed) {
    missionEarnings += mission.reward;
    grantCoins(mission.reward);
    particles.spawnShockwave(car.x, car.y, "#f0b15e", 4.4);
    audio.mission();
    hud.showToast(
      `悬赏达成 · ${missionTitle(mission)}`,
      `+${mission.reward} 金币 · 已入账`,
    );
  }
  missionSyncClock += dt;
  if (completed.length > 0 || missionSyncClock >= 0.12) {
    missionSyncClock = 0;
    missionBoard.sync(save.missions, completed.length > 0);
  }
}

/* ---------- fixed-step simulation ---------- */
function simulate(dt: number): void {
  elapsed += dt;
  runTime += dt;
  jump.flash = Math.max(0, jump.flash - dt);
  jump.landing = Math.max(0, jump.landing - dt);
  jump.calloutTime = Math.max(0, jump.calloutTime - dt);
  jump.nitroTime = Math.max(0, jump.nitroTime - dt);
  jump.magnetTime = Math.max(0, jump.magnetTime - dt);
  if (!frameFx.airborne && frameFx.pulse > 0) {
    frameFx.pulse = Math.max(0, frameFx.pulse - dt);
    if (frameFx.pulse === 0) setFrameFx("off", 0, frameFx.color, 0);
  }

  const gasHeld = readGas();
  const brakeHeld = readBrake();
  const canDrive = fuel > 0 && !car.crashed;
  const brake = !car.crashed && brakeHeld;
  const throttle = canDrive && gasHeld && !brakeHeld;
  const nitroActive = jump.nitroTime > 0 && !car.crashed;

  if (!car.crashed) {
    const speed = Math.abs(car.vx);
    const burn =
      0.48 +
      (throttle ? 2.05 : 0) +
      (brake ? 0.12 : 0) +
      Math.min(speed * 0.016, 0.34);
    fuel = Math.max(0, fuel - dt * burn * stats.fuelBurnFactor);
  }

  previousCar.x = car.x;
  previousCar.y = car.y;
  previousCar.angle = car.angle;
  previousCar.vx = car.vx;

  const events = physics.solve(
    dt,
    { throttle, brake, gasHeld, brakeHeld, canDrive },
    stats,
    { nitro: nitroActive },
  );

  for (const impact of events.impacts) {
    particles.spawnPickup(impact.x, impact.y, "#f0b15e");
    addShake(0.22);
  }
  ghostRecorder.tick(dt, car.x, car.y, car.angle);

  if (car.contactCount > 0 && !car.crashed) {
    stuckTimer =
      Math.abs(car.vx) < 0.35 && (throttle || brake) ? stuckTimer + dt : 0;
    if (stuckTimer > 4 && fuel > 15) respawn(true);
  } else {
    stuckTimer = 0;
  }

  const groundedNow = events.grounded;
  if (!groundedNow && events.wasGrounded && hasTouchedGround) beginJump();
  if (!groundedNow && jump.airborne) {
    jump.duration += dt;
    jump.airRotation += car.omega * dt;
    const totalFlips = Math.floor(
      (Math.abs(jump.airRotation) + FLIP_TOLERANCE) / TAU,
    );
    if (totalFlips > jump.flipsCompleted) {
      jump.flipsCompleted = totalFlips;
      triggerFlip(totalFlips);
    }
    while (jump.tier < JUMP_STAGES.length) {
      const stage = JUMP_STAGES[jump.tier as number]!;
      if (jump.duration + 0.000001 < stage.time) break;
      triggerJumpTier((jump.tier + 1) as JumpTier);
    }
  } else if (groundedNow && jump.airborne) {
    finishJump();
  }
  if (groundedNow && !events.wasGrounded && car.vy > 2.7 && !jump.landing) {
    addShake(0.55);
    particles.spawnDust(car.x - 0.75, car.y + 0.45, -1, car.vx);
    particles.spawnDust(car.x + 0.75, car.y + 0.45, 1, car.vx);
  }
  if (groundedNow) hasTouchedGround = true;
  updateWheelie(dt);

  if (events.crashed) {
    addShake(1.05);
    jump.airborne = false;
    jump.duration = 0;
    jump.tier = 0;
    jump.airRotation = 0;
    jump.flipsCompleted = 0;
    jump.wheelieTime = 0;
    jump.wheelieTick = 0;
    jump.perfectCombo = 0;
    jump.stuntTitle = "";
    jump.stuntSubtitle = "";
    jump.calloutTime = 0;
    jump.flash = 0.4;
    jump.flashColor = "#eb633a";
    setFrameFx("crash", 2, "#eb633a", 1.5);
    particles.spawnShockwave(car.x, car.y, "#eb633a", 5.5);
    particles.spawnJumpBurst(car.x, car.y, 2, "#eb633a");
    audio.crash();
    hud.showToast("翻车失控", "本程即将结算");
  }

  if (car.crashed) {
    car.crashTimer += dt;
    if (car.crashTimer > CRASH_SETTLE_TIME) {
      endRun("crash");
      return;
    }
  }

  if (car.contactCount > 0 && (throttle || brake) && Math.random() < dt * 28) {
    for (let i = 0; i < car.contact.length; i++) {
      if (car.contact[i]) {
        particles.spawnDust(
          car.wheelWorld[i]!.x,
          car.wheelWorld[i]!.y + 0.3,
          i % 2 === 0 ? -1 : 1,
          car.vx,
        );
      }
    }
  }

  if (car.contactCount > 0 && !car.crashed && Math.abs(car.vx) > 2) {
    const surface = surfaceAt(car.x, stats.gripFactor);
    if (surface.kind === "mud" && Math.random() < dt * 28) {
      const rear = car.wheelWorld[0]!;
      particles.spawnMud(rear.x, rear.y + 0.28, -1, car.vx);
    } else if (surface.kind === "ice" && Math.random() < dt * 12) {
      const rear = car.wheelWorld[0]!;
      particles.spawnSnowSpray(rear.x, rear.y + 0.24, -1, car.vx);
    }
  }

  if (nitroActive) {
    nitroExhaustTimer -= dt;
    if (nitroExhaustTimer <= 0) {
      particles.spawnNitroFlame(car, physics.vehicle, 1);
      nitroExhaustTimer = 0.016 + Math.random() * 0.012;
    }
  } else {
    nitroExhaustTimer = 0;
  }

  if (throttle || (canDrive && gasHeld && car.contactCount === 0)) {
    exhaustTimer -= dt;
    if (exhaustTimer <= 0) {
      particles.spawnExhaust(car, physics.vehicle);
      exhaustTimer = 0.055 + Math.random() * 0.05;
    }
  }

  car.maxX = Math.max(car.maxX, car.x);
  distance = Math.max(distance, car.maxX - START_X);

  const stage = stageInfoAt(distance);
  if (stage.globalStage > lastStageGlobal) {
    lastStageGlobal = stage.globalStage;
    hud.showToast(`进入赛段 · ${stage.name}`, stage.hint);
  }

  updateGhost();
  updateMissions(dt);
  updateItems(dt);
  ensureChunksAhead();
  particles.update(dt);

  const fuelRatio = fuel / stats.fuelCapacity;
  if (fuelRatio <= LOW_FUEL_RATIO && !lowFuelWarned && !car.crashed) {
    lowFuelWarned = true;
    hud.showToast("燃油告急", "寻找下一个红色油桶");
  }
  if (fuel <= 0 && !car.crashed) {
    emptyTimer += dt;
    if (!emptyWarned) {
      emptyWarned = true;
      hud.showToast("燃油耗尽", "靠惯性寻找下坡");
    }
    const speed = Math.hypot(car.vx, car.vy);
    if ((speed < 0.9 && emptyTimer > 1.4) || emptyTimer > 15) {
      endRun("fuel");
      return;
    }
  }
}

/* ---------- render ---------- */
function render(time: number): void {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  makeView(time);
  const stage = stageInfoAt(distance);
  const palette = biomePaletteAt(distance);
  const rc: RenderContext = {
    ctx,
    width: W,
    height: H,
    view,
    time,
    stage,
    palette,
  };
  skyRenderer.draw(rc);
  mountainRenderer.draw(rc, camera.x);
  terrainRenderer.draw(rc);
  terrainRenderer.drawVents(rc);
  terrainRenderer.drawMarkers(rc);
  itemRenderer.draw(rc, items);

  let ghostScreenX: number | null = null;
  if (state !== "intro" && activeGhost && ghostPlayback && ghostPose) {
    vehicleRenderer.drawGhostMarker(
      rc,
      START_X + activeGhost.record.distance,
      activeGhost.kind,
      activeGhost.record.distance,
    );
    ghostScreenX = vehicleRenderer.drawGhost(
      rc,
      VEHICLES[activeGhost.record.vehicleId],
      ghostPose,
      activeGhost.record,
      activeGhost.kind,
      distance,
    );
  }

  particles.draw(rc, false);
  jumpFxRenderer.drawAura(rc, renderCar, jump);
  jumpFxRenderer.drawMagnetAura(rc, renderCar, jump);
  vehicleRenderer.draw(rc, renderCar, physics.vehicle);
  particles.draw(rc, true);
  atmosphereRenderer.drawMotes(rc);
  jumpFxRenderer.drawFlash(rc, renderCar, jump);
  jumpFxRenderer.drawCallout(rc, renderCar, jump);
  if (
    state === "playing" &&
    activeGhost &&
    ghostScreenX !== null &&
    (ghostScreenX < 0 || ghostScreenX > W) &&
    Math.abs(ghostDelta) <= GHOST_RADAR_RANGE
  ) {
    jumpFxRenderer.drawGhostRadar(
      rc,
      ghostScreenX,
      ghostDelta,
      activeGhost.kind,
    );
  }
  atmosphereRenderer.drawGrain(rc);
}

/* ---------- frame loop ---------- */
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!lastFrame) lastFrame = now;
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;

  if (state === "playing") {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= GOAL_STEP && steps < 6 && state === "playing") {
      simulate(GOAL_STEP);
      accumulator -= GOAL_STEP;
      steps++;
    }
    if (steps === 6) accumulator = 0;
    hud.update(snapshot());
  } else {
    particles.update(dt);
  }

  syncRenderCar();
  updateCamera(dt);
  render(now / 1000);
  audio.updateEngine(
    state === "playing" && !car.crashed,
    readGas(),
    Math.abs(car.vx),
    state === "playing" && jump.nitroTime > 0 && !car.crashed,
  );
  if (garage.isOpen) garage.tick(now / 1000);
}

/* ---------- garage / meta ---------- */
const garage = new GarageModal(save, {
  onAction: (kind) => {
    persistSave(save, true);
    if (kind === "upgrade") audio.upgrade();
    else if (kind === "unlock") audio.unlock();
    else audio.select();
    hud.updateMeta(save.best, save.coins);
    hud.update(snapshot(), true);
    if (kind !== "upgrade" && state === "intro") {
      runConfig = resolveRunConfig("standard");
      resetRun();
      snapCamera();
      updateModeUi();
    }
  },
  onClose: () => {
    hud.updateMeta(save.best, save.coins);
    hud.update(snapshot(), true);
  },
});

function openGarage(): void {
  if (state === "playing") return;
  audio.ensure();
  garage.open();
}

/* ---------- pit bulletin ---------- */
const noticeBtn = byId<HTMLButtonElement>("noticeBtn");
const noticeDot = byId("noticeDot");
const noticeVersion = byId("noticeVersion");
const noticeList = byId("noticeList");
const noticeTabUpdate = byId<HTMLButtonElement>("noticeTabUpdate");
const noticeTabBulletin = byId<HTMLButtonElement>("noticeTabBulletin");
const noticeOkBtn = byId<HTMLButtonElement>("noticeOkBtn");
const noticeCloseBtn = byId<HTMLButtonElement>("noticeCloseBtn");
let noticeCategory: NoticeCategory = "update";

function updateNoticeBadge(): void {
  const unread = save.lastSeenNoticeId !== LATEST_NOTICE_ID;
  noticeDot.hidden = !unread;
  noticeBtn.classList.toggle("has-unread", unread);
  noticeBtn.setAttribute(
    "aria-label",
    unread ? "山脊公报（有未读更新）" : "山脊公报",
  );
  // The entry button advertises the newest tagged release, even when the
  // latest bulletin itself carries no version.
  const latestVersioned = NOTICES.find((entry) => entry.version);
  if (latestVersioned?.version) {
    noticeVersion.textContent = latestVersioned.version.replace(/\.0$/, "");
  }
}

function createNoticeCard(entry: NoticeEntry): HTMLElement {
  const card = document.createElement("article");
  card.className = "notice-card";
  card.dataset.noticeId = entry.id;
  if (entry.pinned) card.classList.add("is-pinned");

  const head = document.createElement("header");
  head.className = "notice-card-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "notice-card-title";
  if (entry.pinned) {
    const pin = document.createElement("span");
    pin.className = "notice-pin";
    pin.textContent = "PINNED";
    titleWrap.appendChild(pin);
  }
  const title = document.createElement("h3");
  title.textContent = entry.title;
  titleWrap.appendChild(title);
  head.appendChild(titleWrap);

  if (entry.version) {
    const version = document.createElement("span");
    version.className = "notice-version";
    version.textContent = entry.version;
    head.appendChild(version);
  }
  card.appendChild(head);

  const date = document.createElement("p");
  date.className = "notice-date";
  date.textContent = entry.date;
  card.appendChild(date);

  const summary = document.createElement("p");
  summary.className = "notice-summary";
  summary.textContent = entry.summary;
  card.appendChild(summary);

  const items = document.createElement("ul");
  items.className = "notice-items";
  for (const item of entry.items) {
    const row = document.createElement("li");
    row.className = "notice-item";

    const tag = document.createElement("span");
    tag.className = "notice-tag";
    tag.dataset.tone = item.tone;
    tag.textContent = item.tag;

    const text = document.createElement("span");
    text.className = "notice-item-text";
    text.textContent = item.text;

    row.append(tag, text);
    items.appendChild(row);
  }
  card.appendChild(items);

  return card;
}

function renderNoticeList(category: NoticeCategory): void {
  const entries: NoticeEntry[] = [
    ...NOTICES.filter((entry) => entry.category === category && entry.pinned),
    ...NOTICES.filter((entry) => entry.category === category && !entry.pinned),
  ];
  noticeList.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "notice-empty";
    empty.textContent = "这一栏还没有新的公报。";
    noticeList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of entries) fragment.appendChild(createNoticeCard(entry));
  noticeList.appendChild(fragment);
}

function setNoticeTab(category: NoticeCategory, focusTab = false): void {
  noticeCategory = category;
  const isUpdate = category === "update";
  noticeTabUpdate.classList.toggle("is-active", isUpdate);
  noticeTabBulletin.classList.toggle("is-active", !isUpdate);
  noticeTabUpdate.setAttribute("aria-selected", String(isUpdate));
  noticeTabBulletin.setAttribute("aria-selected", String(!isUpdate));
  noticeTabUpdate.tabIndex = isUpdate ? 0 : -1;
  noticeTabBulletin.tabIndex = isUpdate ? -1 : 0;
  renderNoticeList(category);
  noticeList.scrollTop = 0;
  if (focusTab) (isUpdate ? noticeTabUpdate : noticeTabBulletin).focus();
}

function openNoticeModal(initialTab?: NoticeCategory): void {
  if (state !== "intro") return;
  audio.ensure();
  setNoticeTab(initialTab ?? noticeCategory);
  save.lastSeenNoticeId = LATEST_NOTICE_ID;
  persistSave(save, true);
  updateNoticeBadge();
  audio.select();
  overlays.showNotice(noticeOkBtn);
}

function handleNoticeTabKey(event: KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  setNoticeTab(noticeCategory === "update" ? "bulletin" : "update", true);
}

noticeBtn.addEventListener("click", () => openNoticeModal());
noticeTabUpdate.addEventListener("click", () => setNoticeTab("update"));
noticeTabBulletin.addEventListener("click", () => setNoticeTab("bulletin"));
noticeTabUpdate.addEventListener("keydown", handleNoticeTabKey);
noticeTabBulletin.addEventListener("keydown", handleNoticeTabKey);
noticeOkBtn.addEventListener("click", () => overlays.hideNotice());
noticeCloseBtn.addEventListener("click", () => overlays.hideNotice());
overlays.notice.addEventListener("click", (event) => {
  if (event.target === overlays.notice) overlays.hideNotice();
});

/* ---------- events ---------- */
function handleKeyDown(event: KeyboardEvent): void {
  if (event.repeat) return;
  const code = event.code;
  const targetTag = event.target instanceof HTMLElement ? event.target.tagName : "";

  if (garage.isOpen) {
    if (code === "Escape" || code === "KeyG") {
      event.preventDefault();
      garage.close();
    } else if (code === "ArrowLeft") {
      event.preventDefault();
      garage.cycle(-1);
    } else if (code === "ArrowRight") {
      event.preventDefault();
      garage.cycle(1);
    }
    return;
  }

  if (code === "Tab") return;

  if (overlays.isNoticeOpen()) {
    if (code === "Escape" || code === "Enter" || code === "NumpadEnter") {
      event.preventDefault();
      overlays.hideNotice();
    }
    return;
  }

  const challengeOpen = !overlays.challenge.classList.contains("is-hidden");
  const posterOpen = !overlays.poster.classList.contains("is-hidden");
  if (challengeOpen || posterOpen) {
    if (code === "Escape") {
      event.preventDefault();
      if (posterOpen) overlays.hidePoster();
      else overlays.hideChallenge();
    }
    return;
  }

  if (code === "KeyN" && state === "intro") {
    event.preventDefault();
    openNoticeModal();
    return;
  }

  if (state === "intro" && (code === "Enter" || code === "Space")) {
    if (targetTag === "BUTTON") return;
    event.preventDefault();
    startRun();
    return;
  }
  if (code === "Enter" && state === "over" && targetTag !== "BUTTON") {
    event.preventDefault();
    startRun();
    return;
  }
  if (code === "Enter" && state === "paused" && targetTag !== "BUTTON") {
    event.preventDefault();
    resumeGame();
    return;
  }
  if (code === "KeyM") {
    event.preventDefault();
    audio.ensure();
    audio.toggleMuted();
    return;
  }
  if (
    targetTag !== "INPUT" &&
    targetTag !== "TEXTAREA" &&
    (state === "intro" || state === "playing" || state === "paused")
  ) {
    if (code === "BracketLeft" || code === "Minus") {
      event.preventDefault();
      stepCameraWidth(-CAMERA_WIDTH_STEP);
      return;
    }
    if (code === "BracketRight" || code === "Equal") {
      event.preventDefault();
      stepCameraWidth(CAMERA_WIDTH_STEP);
      return;
    }
  }
  if (code === "KeyP" || code === "Escape") {
    if (state === "playing") {
      event.preventDefault();
      pauseGame();
    } else if (state === "paused") {
      event.preventDefault();
      resumeGame();
    }
    return;
  }
  if (code === "KeyR") {
    if (state === "playing" || state === "paused") {
      event.preventDefault();
      startRun();
    }
    return;
  }
  if (code === "KeyH" && (state === "paused" || state === "over")) {
    event.preventDefault();
    goHome();
    return;
  }
  if (code === "KeyG" && (state === "intro" || state === "over")) {
    event.preventDefault();
    openGarage();
    return;
  }
  if (
    state !== "playing" &&
    targetTag === "BUTTON" &&
    (code === "Space" || code === "Enter")
  ) {
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(code)) {
    event.preventDefault();
  }
  keys[code] = true;
}

function handleKeyUp(event: KeyboardEvent): void {
  keys[event.code] = false;
}

function bindPedal(button: HTMLElement, name: "gas" | "brake"): void {
  const press = (event: PointerEvent): void => {
    event.preventDefault();
    audio.ensure();
    touch[name] = true;
    button.classList.add("is-pressed");
    try {
      button.setPointerCapture(event.pointerId);
    } catch (_) {
      /* pointer capture is best-effort */
    }
  };
  const release = (event?: PointerEvent): void => {
    touch[name] = false;
    button.classList.remove("is-pressed");
    if (event && event.pointerId != null) {
      try {
        button.releasePointerCapture(event.pointerId);
      } catch (_) {
        /* already released */
      }
    }
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

/* ---------- daily / challenge / share UI ---------- */
const dailyBtnMeta = byId("dailyBtnMeta");
const challengeBtnMeta = byId("challengeBtnMeta");
const challengeBanner = byId("challengeBanner");
const challengeBannerTarget = byId("challengeBannerTarget");
const challengeBannerMeta = byId("challengeBannerMeta");
const challengeInput = byId<HTMLTextAreaElement>("challengeInput");
const challengeStatus = byId("challengeStatus");

function updateModeUi(): void {
  const today = utcDateKey();
  if (save.dailyDate !== today) {
    refreshDaily(save, today);
    persistSave(save, true);
  }
  const seed = dailySeedFor(save.dailyDate || today);
  const vehicle = VEHICLES[dailyVehicleFor(seed)];
  const bestLine = save.dailyBest > 0 ? ` · 今日最佳 ${save.dailyBest}m` : "";
  dailyBtnMeta.textContent = `${save.dailyDate || today} · #${vehicle.number} ${vehicle.name}${bestLine}`;

  if (loadedChallenge) {
    const config = VEHICLES[loadedChallenge.vehicleId];
    challengeBanner.hidden = false;
    challengeBannerTarget.textContent = `目标 ${loadedChallenge.distance}m`;
    challengeBannerMeta.textContent = `${loadedChallenge.mode === "daily" ? "DAILY" : "STANDARD"} · #${config.number} ${config.name} · SEED ${seedHex(loadedChallenge.seed)}`;
    challengeBtnMeta.textContent = `已载入战书 · 目标 ${loadedChallenge.distance}m`;
  } else {
    challengeBanner.hidden = true;
    challengeBtnMeta.textContent = "粘贴挑战码 / 打开好友战书";
  }
}

function challengeLink(code: string): string {
  const base = location.href.split("#")[0] ?? location.href;
  return `${base}#challenge=${code}`;
}

function acceptChallenge(record: GhostRecord): void {
  loadedChallenge = record;
  try {
    const code = encodeGhostCode(record);
    history.replaceState(null, "", challengeLink(code));
  } catch (_) {
    /* file:// or restricted history: the banner still works this session */
  }
  updateModeUi();
}

function openChallengeModal(): void {
  audio.ensure();
  challengeInput.value = loadedChallenge
    ? encodeGhostCode(loadedChallenge)
    : "";
  challengeStatus.dataset.tone = "";
  challengeStatus.textContent = loadedChallenge
    ? `当前已载入战书 · 目标 ${loadedChallenge.distance}m。粘贴新代码可替换。`
    : "";
  overlays.showChallenge();
}

function loadChallengeFromInput(): void {
  const record = decodeChallengeCode(challengeInput.value);
  if (!record) {
    audio.deny();
    challengeStatus.dataset.tone = "error";
    challengeStatus.textContent =
      "挑战码损坏或格式不正确。请确认以 RR2. 开头，并完整复制。";
    return;
  }
  acceptChallenge(record);
  challengeStatus.dataset.tone = "ok";
  challengeStatus.textContent = `战书有效 · 目标 ${record.distance}m，已载入首页。`;
  audio.select();
  overlays.hideChallenge();
  hud.showToast("战书已加载", `目标 ${record.distance}m · 点击应战发车`);
}

function clearLoadedChallenge(): void {
  loadedChallenge = null;
  try {
    const base = location.href.split("#")[0] ?? location.href;
    history.replaceState(null, "", base);
  } catch (_) {
    /* ignore restricted history */
  }
  updateModeUi();
  hud.showToast("战书已移除", "当前将按常规赛发车");
}

function currentShareCode(): string | null {
  if (lastSummary) {
    return lastSummary.distance >= 1 && lastSummary.challengeCode
      ? lastSummary.challengeCode
      : null;
  }
  if (loadedChallenge && loadedChallenge.distance >= 1) {
    return encodeGhostCode(loadedChallenge);
  }
  return null;
}

function fallbackCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-9999px";
  area.style.opacity = "0";
  area.style.userSelect = "text";
  area.style.webkitUserSelect = "text";
  document.body.appendChild(area);
  area.focus();
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_) {
    copied = false;
  }
  area.remove();
  return copied;
}

async function copyText(
  text: string,
  main: string,
  detail: string,
): Promise<void> {
  let copied = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (_) {
    copied = false;
  }
  if (!copied) copied = fallbackCopy(text);
  if (copied) hud.showToast(main, detail);
  else hud.showToast("复制失败", "请手动选中挑战码复制");
}

async function copyChallengeLink(): Promise<void> {
  const code = currentShareCode();
  if (!code) {
    hud.showToast("暂无可分享战书", "先完成一程，再复制挑战链接");
    return;
  }
  const target = lastSummary?.distance ?? loadedChallenge?.distance ?? 0;
  await copyText(
    challengeLink(code),
    "战书链接已复制",
    `目标 ${target}m · 打开链接即可同屏竞速`,
  );
}

async function openPoster(): Promise<void> {
  if (!lastSummary) {
    hud.showToast("尚无战报", "完成一程后再生成战术战报");
    return;
  }
  const summary = lastSummary;
  posterReady = false;
  overlays.showPoster();
  try {
    await posterGenerator.render({
      vehicleId: summary.vehicleId,
      distance: summary.distance,
      mode: summary.mode,
      modeLabel: summary.modeLabel,
      seed: summary.seed,
      dateKey: summary.dateKey,
      record: summary.record,
      dailyRecord: summary.dailyRecord,
      challengeWin: summary.challengeWin,
      runCoins: summary.runCoins,
      flips: summary.flips,
      bestCombo: summary.bestCombo,
      bounty: summary.bounty,
      stageCount: summary.stageCount,
      challengeCode: summary.challengeCode,
      generatedLabel: utcDateKey(),
    });
    posterReady = true;
  } catch (_) {
    posterReady = false;
    overlays.hidePoster();
    hud.showToast("战报生成失败", "请关闭弹窗后重试");
  }
}

function downloadPoster(): void {
  if (!lastSummary) return;
  if (!posterReady) {
    hud.showToast("战报尚未生成", "请稍候再下载");
    return;
  }
  try {
    posterGenerator.download(lastSummary.distance);
    hud.showToast(
      "PNG 已生成",
      `ridge-run-${lastSummary.distance}m.png`,
    );
  } catch (_) {
    posterReady = false;
    hud.showToast("导出失败", "请重新生成战报后再试");
  }
}

/* ---------- boot ---------- */
function boot(): void {
  resize();
  atmosphereRenderer.init(ctx);

  document.body.classList.toggle("is-muted", save.muted);
  hud.setMuted(save.muted);
  hud.setCameraWidth(save.cameraWidth);
  hud.updateMeta(save.best, save.coins);

  overlays.hidePause();
  overlays.hideResult();
  overlays.hideChallenge();
  overlays.hidePoster();
  overlays.hideNotice();
  overlays.showIntro();
  updateNoticeBadge();
  updateModeUi();

  state = "intro";
  hud.setMode("intro");
  hud.setModeChip("", "standard");
  resetRun();
  snapCamera();
  hud.update(snapshot(), true);
  missionBoard.sync(save.missions, true);
  hud.hideToast();

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", handleKeyDown, { passive: false });
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", clearPressed);
window.addEventListener("beforeunload", () => flushSave(save));

challengeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    loadChallengeFromInput();
  }
});

window.addEventListener("hashchange", () => {
  if (!location.hash) {
    if (loadedChallenge) {
      loadedChallenge = null;
      updateModeUi();
    }
    return;
  }
  const record = challengeFromHash(location.hash);
  if (record) {
    loadedChallenge = record;
    updateModeUi();
    return;
  }
  if (location.hash.startsWith("#challenge=")) {
    loadedChallenge = null;
    updateModeUi();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") pauseGame();
  else if (!document.hidden && state === "intro") updateModeUi();
});
window.addEventListener("focus", () => {
  if (state === "intro") updateModeUi();
});

byId("startBtn").addEventListener("click", () => startRun("standard"));
byId("dailyBtn").addEventListener("click", () => startRun("daily"));
byId("challengeBtn").addEventListener("click", openChallengeModal);
byId("challengeStartBtn").addEventListener("click", () =>
  startRun("challenge"),
);
byId("challengeClearBtn").addEventListener("click", clearLoadedChallenge);
byId("challengeLoadBtn").addEventListener("click", loadChallengeFromInput);
byId("challengeCloseBtn").addEventListener("click", () =>
  overlays.hideChallenge(),
);
byId("copyChallengeBtn").addEventListener("click", copyChallengeLink);
byId("posterBtn").addEventListener("click", () => void openPoster());
byId("posterDownloadBtn").addEventListener("click", downloadPoster);
byId("posterCopyBtn").addEventListener("click", copyChallengeLink);
byId("posterCloseBtn").addEventListener("click", () =>
  overlays.hidePoster(),
);
byId("pauseBtn").addEventListener("click", pauseGame);
byId("resumeBtn").addEventListener("click", resumeGame);
byId("pauseRestartBtn").addEventListener("click", () => startRun());
byId("pauseHomeBtn").addEventListener("click", goHome);
byId("againBtn").addEventListener("click", () => startRun());
byId("homeBtn").addEventListener("click", goHome);
byId("muteBtn").addEventListener("click", () => {
  audio.ensure();
  audio.toggleMuted();
});
byId("pauseMuteBtn").addEventListener("click", () => {
  audio.ensure();
  audio.toggleMuted();
});
byId("fovBtn").addEventListener("click", cycleCameraPreset);
byId<HTMLInputElement>("introFovRange").addEventListener("input", (event) => {
  const val = Number((event.currentTarget as HTMLInputElement).value);
  setCameraWidth(val);
});
byId<HTMLInputElement>("pauseFovRange").addEventListener("input", (event) => {
  const val = Number((event.currentTarget as HTMLInputElement).value);
  setCameraWidth(val);
});
byId("introFovDecBtn").addEventListener("click", () =>
  stepCameraWidth(-CAMERA_WIDTH_STEP),
);
byId("introFovIncBtn").addEventListener("click", () =>
  stepCameraWidth(CAMERA_WIDTH_STEP),
);
byId("introFovResetBtn").addEventListener("click", () =>
  setCameraWidth(DEFAULT_CAMERA_WIDTH, { announce: true, sound: true }),
);
byId("pauseFovDecBtn").addEventListener("click", () =>
  stepCameraWidth(-CAMERA_WIDTH_STEP),
);
byId("pauseFovIncBtn").addEventListener("click", () =>
  stepCameraWidth(CAMERA_WIDTH_STEP),
);
byId("pauseFovResetBtn").addEventListener("click", () =>
  setCameraWidth(DEFAULT_CAMERA_WIDTH, { announce: true, sound: true }),
);
byId("garageHomeBtn").addEventListener("click", openGarage);
byId("resultUpgradeBtn").addEventListener("click", openGarage);

bindPedal(byId("gasBtn"), "gas");
bindPedal(byId("brakeBtn"), "brake");

function handleResize(): void {
  resize();
  if (state === "intro") snapCamera();
}
window.addEventListener("resize", handleResize);
window.visualViewport?.addEventListener("resize", handleResize);

boot();
