import {
  DEFAULT_CAMERA_WIDTH,
  LEGACY_SAVE_KEY,
  MAX_CAMERA_WIDTH,
  MAX_UPGRADE_LEVEL,
  MIN_CAMERA_WIDTH,
  MISSION_SLOTS,
  SAVE_KEY,
  VEHICLE_ORDER,
} from "./constants";
import { dailySeedFor, isDateKey } from "./daily";
import { sanitizeGhostRecord } from "./ghost/GhostSystem";
import {
  defaultMissions,
  rollMissions,
} from "./missions";
import type {
  GameSave,
  MissionKind,
  MissionState,
  UpgradeKey,
  UpgradeLevels,
  VehicleId,
} from "./types";
import { clamp, mulberry32 } from "./utils";

const UPGRADE_KEYS: UpgradeKey[] = ["engine", "suspension", "tires", "fuel"];

export function defaultUpgradeLevels(): UpgradeLevels {
  return { engine: 1, suspension: 1, tires: 1, fuel: 1 };
}

export function defaultSave(): GameSave {
  return {
    best: 0,
    coins: 0,
    muted: false,
    cameraWidth: DEFAULT_CAMERA_WIDTH,
    selectedVehicle: "rally",
    unlockedVehicles: ["rally"],
    upgrades: {
      rally: defaultUpgradeLevels(),
      moto: defaultUpgradeLevels(),
      truck: defaultUpgradeLevels(),
    },
    bestGhost: null,
    dailyDate: "",
    dailyBest: 0,
    dailyFirstClaimed: false,
    dailyGhost: null,
    missions: defaultMissions(),
    completedMissions: 0,
  };
}

function isVehicleId(value: unknown): value is VehicleId {
  return typeof value === "string" && VEHICLE_ORDER.includes(value as VehicleId);
}

function normalizeLevel(value: unknown): number {
  return clamp(Math.floor(Number(value) || 1), 1, MAX_UPGRADE_LEVEL);
}

function normalizeUpgrades(value: unknown): UpgradeLevels {
  const source = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const levels = defaultUpgradeLevels();
  for (const key of UPGRADE_KEYS) levels[key] = normalizeLevel(source[key]);
  return levels;
}

const MISSION_KINDS: MissionKind[] = [
  "distance",
  "flips",
  "perfect",
  "coins",
  "wheelie",
  "stage",
];

function normalizeMission(value: unknown): MissionState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const kind = MISSION_KINDS.includes(source.kind as MissionKind)
    ? (source.kind as MissionKind)
    : null;
  if (!kind) return null;
  const target = Math.floor(Number(source.target));
  const reward = Math.floor(Number(source.reward));
  if (!Number.isFinite(target) || target < 1 || target > 100000) return null;
  if (!Number.isFinite(reward) || reward < 0 || reward > 10000) return null;
  return {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : `${kind}-${target}`,
    kind,
    target,
    reward,
    progress: 0,
    done: false,
  };
}

function normalizeMissions(
  value: unknown,
  completed: number,
): MissionState[] {
  const source = Array.isArray(value) ? value : [];
  const out: MissionState[] = [];
  const used: MissionKind[] = [];
  for (const raw of source) {
    if (out.length >= MISSION_SLOTS) break;
    const mission = normalizeMission(raw);
    if (!mission || used.includes(mission.kind)) continue;
    used.push(mission.kind);
    out.push(mission);
  }
  if (out.length < MISSION_SLOTS) {
    out.push(
      ...rollMissions(
        completed,
        used,
        mulberry32(0x51ce + completed),
        MISSION_SLOTS - out.length,
      ),
    );
  }
  return out;
}

function normalize(raw: unknown): GameSave {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const save = defaultSave();

  save.best = Math.max(0, Math.floor(Number(source.best) || 0));
  save.coins = Math.max(0, Math.floor(Number(source.coins) || 0));
  save.muted = !!source.muted;
  const rawCameraWidth = Number(source.cameraWidth);
  save.cameraWidth =
    Number.isFinite(rawCameraWidth) && rawCameraWidth > 0
      ? clamp(Math.round(rawCameraWidth), MIN_CAMERA_WIDTH, MAX_CAMERA_WIDTH)
      : DEFAULT_CAMERA_WIDTH;

  const unlocked = new Set<VehicleId>(["rally"]);
  if (Array.isArray(source.unlockedVehicles)) {
    for (const id of source.unlockedVehicles) {
      if (isVehicleId(id)) unlocked.add(id);
    }
  }
  save.unlockedVehicles = VEHICLE_ORDER.filter((id) => unlocked.has(id));

  const selected = isVehicleId(source.selectedVehicle)
    ? source.selectedVehicle
    : "rally";
  save.selectedVehicle = unlocked.has(selected) ? selected : "rally";

  const upgrades = (source.upgrades && typeof source.upgrades === "object"
    ? source.upgrades
    : {}) as Record<string, unknown>;
  for (const id of VEHICLE_ORDER) {
    save.upgrades[id] = normalizeUpgrades(upgrades[id]);
  }

  // v2.1 additions: ghosts, daily board and pit contracts. Older saves simply
  // keep their coins / best / garage and receive the new defaults.
  const bestGhost = sanitizeGhostRecord(source.bestGhost);
  save.bestGhost = bestGhost && bestGhost.mode === "standard" ? bestGhost : null;

  save.dailyDate = isDateKey(source.dailyDate) ? source.dailyDate : "";
  save.dailyBest = Math.max(0, Math.floor(Number(source.dailyBest) || 0));
  save.dailyFirstClaimed = !!source.dailyFirstClaimed;
  const dailyGhost = sanitizeGhostRecord(source.dailyGhost);
  save.dailyGhost =
    dailyGhost &&
    dailyGhost.mode === "daily" &&
    dailyGhost.dateKey === save.dailyDate &&
    dailyGhost.seed === dailySeedFor(save.dailyDate)
      ? dailyGhost
      : null;

  save.completedMissions = Math.max(
    0,
    Math.floor(Number(source.completedMissions) || 0),
  );
  save.missions = normalizeMissions(source.missions, save.completedMissions);

  return save;
}

export function loadSave(): GameSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (_) {
    /* corrupted v2 save: fall through to legacy / defaults */
  }

  try {
    const legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
      const save = normalize(legacy);
      // v1 only knew best/coins/muted; the garage starts fully stock.
      save.selectedVehicle = "rally";
      save.unlockedVehicles = ["rally"];
      save.upgrades = {
        rally: defaultUpgradeLevels(),
        moto: defaultUpgradeLevels(),
        truck: defaultUpgradeLevels(),
      };
      flushSaveInternal(save);
      return save;
    }
  } catch (_) {
    /* ignore legacy parse errors */
  }

  return defaultSave();
}

/* ---------- debounced persistence ---------- */
let pending: GameSave | null = null;
let timer: number | null = null;

function flushSaveInternal(save: GameSave | null): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  const snapshot = save ?? pending;
  pending = null;
  if (!snapshot) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  } catch (_) {
    /* storage full / private mode: the run still works in memory */
  }
}

/** Coalesce high-frequency coin pickups into one write. */
export function persistSave(save: GameSave, immediate = false): void {
  pending = save;
  if (immediate) {
    flushSaveInternal(save);
    return;
  }
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    flushSaveInternal(null);
  }, 220);
}

export function flushSave(save?: GameSave): void {
  if (save) pending = save;
  flushSaveInternal(null);
}
