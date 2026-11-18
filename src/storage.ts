import {
  DEFAULT_CAMERA_WIDTH,
  LEGACY_BACKUP_KEY,
  LEGACY_SAVE_KEY,
  MAX_CAMERA_WIDTH,
  MAX_SAVE_INT,
  MAX_UPGRADE_LEVEL,
  MIN_CAMERA_WIDTH,
  MISSION_SLOTS,
  SAVE_BACKUP_KEY,
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

export interface SaveReport {
  corruptRecovered: boolean;
  backupSaved: boolean;
  repairedFields: string[];
  storageReadBlocked: boolean;
  preserveRawPrimary: boolean;
  writeFailed: boolean;
}

export type StorageErrorKind = "write-failed";
export type StorageErrorListener = (kind: StorageErrorKind) => void;

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
    lastSeenNoticeId: "",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeNonNegInt(
  value: unknown,
  field: string,
  repaired: string[],
  max = MAX_SAVE_INT,
): number {
  if (value === undefined) return 0;
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || parsed > max) {
    repaired.push(field);
    if (parsed !== null && parsed > max) return max;
    return 0;
  }
  return Math.floor(parsed);
}

function isVehicleId(value: unknown): value is VehicleId {
  return typeof value === "string" && VEHICLE_ORDER.includes(value as VehicleId);
}

function normalizeLevel(
  value: unknown,
  field: string,
  repaired: string[],
): number {
  if (value === undefined) return 1;
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 1 || parsed > MAX_UPGRADE_LEVEL) {
    repaired.push(field);
    if (parsed !== null) {
      return clamp(Math.floor(parsed), 1, MAX_UPGRADE_LEVEL);
    }
    return 1;
  }
  return Math.floor(parsed);
}

function normalizeUpgrades(
  value: unknown,
  vehicleId: VehicleId,
  repaired: string[],
): UpgradeLevels {
  if (value !== undefined && !isPlainObject(value)) {
    repaired.push(`upgrades.${vehicleId}`);
  }
  const source = isPlainObject(value) ? value : {};
  const levels = defaultUpgradeLevels();
  for (const key of UPGRADE_KEYS) {
    levels[key] = normalizeLevel(source[key], `upgrades.${vehicleId}.${key}`, repaired);
  }
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
  if (!isPlainObject(value)) return null;
  const source = value;
  const kind = MISSION_KINDS.includes(source.kind as MissionKind)
    ? (source.kind as MissionKind)
    : null;
  if (!kind) return null;
  const rawTarget = parseFiniteNumber(source.target);
  const rawReward = parseFiniteNumber(source.reward);
  if (rawTarget === null || rawReward === null) return null;
  const target = Math.floor(rawTarget);
  const reward = Math.floor(rawReward);
  if (target < 1 || target > 100000) return null;
  if (reward < 0 || reward > 10000) return null;
  const done = source.done === true;
  const rawProgress = parseFiniteNumber(source.progress);
  const progress = done
    ? target
    : rawProgress !== null
      ? clamp(rawProgress, 0, target)
      : 0;
  return {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : `${kind}-${target}`,
    kind,
    target,
    reward,
    progress,
    done,
  };
}

function normalizeMissions(
  value: unknown,
  completed: number,
  repaired: string[],
): MissionState[] {
  if (value !== undefined && !Array.isArray(value)) {
    repaired.push("missions");
  }
  const source = Array.isArray(value) ? value : [];
  const out: MissionState[] = [];
  const used: MissionKind[] = [];
  for (const raw of source) {
    if (out.length >= MISSION_SLOTS) break;
    const mission = normalizeMission(raw);
    if (!mission || used.includes(mission.kind)) {
      repaired.push("missions");
      continue;
    }
    used.push(mission.kind);
    out.push(mission);
  }
  if (out.length < MISSION_SLOTS) {
    if (value !== undefined && source.length < MISSION_SLOTS) {
      repaired.push("missions");
    }
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

function normalize(raw: unknown, repaired: string[]): GameSave {
  const source = isPlainObject(raw) ? raw : {};
  const save = defaultSave();

  save.best = normalizeNonNegInt(source.best, "best", repaired);
  save.coins = normalizeNonNegInt(source.coins, "coins", repaired);
  if (source.muted !== undefined && typeof source.muted !== "boolean") {
    repaired.push("muted");
  }
  save.muted = source.muted === true;

  const parsedCam = parseFiniteNumber(source.cameraWidth);
  if (source.cameraWidth !== undefined) {
    if (
      parsedCam === null ||
      parsedCam <= 0 ||
      Math.round(parsedCam) < MIN_CAMERA_WIDTH ||
      Math.round(parsedCam) > MAX_CAMERA_WIDTH
    ) {
      repaired.push("cameraWidth");
    }
  }
  save.cameraWidth =
    parsedCam !== null && parsedCam > 0
      ? clamp(Math.round(parsedCam), MIN_CAMERA_WIDTH, MAX_CAMERA_WIDTH)
      : DEFAULT_CAMERA_WIDTH;

  const unlocked = new Set<VehicleId>(["rally"]);
  if (source.unlockedVehicles !== undefined && !Array.isArray(source.unlockedVehicles)) {
    repaired.push("unlockedVehicles");
  }
  if (Array.isArray(source.unlockedVehicles)) {
    for (const id of source.unlockedVehicles) {
      if (isVehicleId(id)) unlocked.add(id);
      else repaired.push("unlockedVehicles");
    }
  }
  save.unlockedVehicles = VEHICLE_ORDER.filter((id) => unlocked.has(id));

  if (source.selectedVehicle !== undefined && !isVehicleId(source.selectedVehicle)) {
    repaired.push("selectedVehicle");
  }
  const selected = isVehicleId(source.selectedVehicle)
    ? source.selectedVehicle
    : "rally";
  if (selected !== "rally" && !unlocked.has(selected)) {
    repaired.push("selectedVehicle");
  }
  save.selectedVehicle = unlocked.has(selected) ? selected : "rally";

  if (source.upgrades !== undefined && !isPlainObject(source.upgrades)) {
    repaired.push("upgrades");
  }
  const upgrades = isPlainObject(source.upgrades) ? source.upgrades : {};
  for (const id of VEHICLE_ORDER) {
    save.upgrades[id] = normalizeUpgrades(upgrades[id], id, repaired);
  }

  // v2.1 additions: ghosts, daily board and pit contracts. Older saves simply
  // keep their coins / best / garage and receive the new defaults.
  const bestGhost = sanitizeGhostRecord(source.bestGhost);
  save.bestGhost =
    bestGhost && bestGhost.mode === "standard" && bestGhost.distance <= save.best
      ? bestGhost
      : null;
  if (
    source.bestGhost !== undefined &&
    source.bestGhost !== null &&
    save.bestGhost === null
  ) {
    repaired.push("bestGhost");
  }

  if (
    source.dailyDate !== undefined &&
    source.dailyDate !== "" &&
    !isDateKey(source.dailyDate)
  ) {
    repaired.push("dailyDate");
  }
  save.dailyDate = isDateKey(source.dailyDate) ? source.dailyDate : "";
  save.dailyBest = normalizeNonNegInt(source.dailyBest, "dailyBest", repaired);
  if (
    source.dailyFirstClaimed !== undefined &&
    typeof source.dailyFirstClaimed !== "boolean"
  ) {
    repaired.push("dailyFirstClaimed");
  }
  save.dailyFirstClaimed = source.dailyFirstClaimed === true;

  const dailyGhost = sanitizeGhostRecord(source.dailyGhost);
  save.dailyGhost =
    dailyGhost &&
    dailyGhost.mode === "daily" &&
    dailyGhost.dateKey === save.dailyDate &&
    dailyGhost.seed === dailySeedFor(save.dailyDate) &&
    dailyGhost.distance <= save.dailyBest
      ? dailyGhost
      : null;
  if (
    source.dailyGhost !== undefined &&
    source.dailyGhost !== null &&
    save.dailyGhost === null
  ) {
    repaired.push("dailyGhost");
  }

  save.completedMissions = normalizeNonNegInt(
    source.completedMissions,
    "completedMissions",
    repaired,
  );
  save.missions = normalizeMissions(
    source.missions,
    save.completedMissions,
    repaired,
  );

  // v2.2 additions: the pit bulletin remembers which entry was last opened.
  if (
    source.lastSeenNoticeId !== undefined &&
    typeof source.lastSeenNoticeId !== "string"
  ) {
    repaired.push("lastSeenNoticeId");
  }
  save.lastSeenNoticeId =
    typeof source.lastSeenNoticeId === "string" ? source.lastSeenNoticeId : "";

  return save;
}

function emptyReport(): SaveReport {
  return {
    corruptRecovered: false,
    backupSaved: false,
    repairedFields: [],
    storageReadBlocked: false,
    preserveRawPrimary: false,
    writeFailed: false,
  };
}

let lastSaveReport: SaveReport = emptyReport();
let lastWriteError: string | null = null;
const errorListeners = new Set<StorageErrorListener>();

export function getSaveReport(): SaveReport {
  return {
    ...lastSaveReport,
    repairedFields: [...lastSaveReport.repairedFields],
  };
}

export function getLastWriteError(): string | null {
  return lastWriteError;
}

export function onStorageError(listener: StorageErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch (_) {
    return null;
  }
}

function backupRawPayload(
  storage: Storage,
  backupKey: string,
  raw: string,
): boolean {
  try {
    storage.setItem(backupKey, raw);
    return true;
  } catch (_) {
    return false;
  }
}

export function loadSave(): GameSave {
  const report = emptyReport();
  lastSaveReport = report;
  lastWriteError = null;
  pending = null;
  if (timer !== null) {
    globalThis.clearTimeout(timer);
    timer = null;
  }

  const storage = safeStorage();
  if (!storage) {
    report.storageReadBlocked = true;
    report.preserveRawPrimary = true;
    return defaultSave();
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (_) {
    report.storageReadBlocked = true;
    report.preserveRawPrimary = true;
    return defaultSave();
  }

  if (raw !== null) {
    let parsed: unknown;
    let validJsonObject = false;
    try {
      parsed = JSON.parse(raw);
      validJsonObject = isPlainObject(parsed);
    } catch (_) {
      validJsonObject = false;
    }

    if (validJsonObject) {
      return normalize(parsed, report.repairedFields);
    }

    report.corruptRecovered = true;
    report.backupSaved = backupRawPayload(storage, SAVE_BACKUP_KEY, raw);
    if (!report.backupSaved) {
      report.preserveRawPrimary = true;
      report.writeFailed = true;
      lastWriteError = "backup-write-failed";
    }
  }

  let legacyRaw: string | null = null;
  try {
    legacyRaw = storage.getItem(LEGACY_SAVE_KEY);
  } catch (_) {
    report.storageReadBlocked = true;
    report.preserveRawPrimary = true;
  }

  if (legacyRaw !== null) {
    let parsedLegacy: unknown;
    let validLegacyObject = false;
    try {
      parsedLegacy = JSON.parse(legacyRaw);
      validLegacyObject = isPlainObject(parsedLegacy);
    } catch (_) {
      validLegacyObject = false;
    }

    if (validLegacyObject) {
      const legacyRepaired: string[] = [];
      const save = normalize(parsedLegacy, legacyRepaired);
      // v1 only knew best/coins/muted; the garage starts fully stock.
      save.selectedVehicle = "rally";
      save.unlockedVehicles = ["rally"];
      save.upgrades = {
        rally: defaultUpgradeLevels(),
        moto: defaultUpgradeLevels(),
        truck: defaultUpgradeLevels(),
      };
      report.repairedFields.push(...legacyRepaired);
      if (!report.preserveRawPrimary && !report.storageReadBlocked) {
        flushSaveInternal(save);
      }
      return save;
    }

    report.corruptRecovered = true;
    const legacyBackedUp = backupRawPayload(storage, LEGACY_BACKUP_KEY, legacyRaw);
    if (!legacyBackedUp) {
      report.backupSaved = false;
      report.writeFailed = true;
      lastWriteError = "backup-write-failed";
    }
  }

  return defaultSave();
}

/* ---------- debounced persistence ---------- */
let pending: GameSave | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flushSaveInternal(save: GameSave | null): void {
  if (timer !== null) {
    globalThis.clearTimeout(timer);
    timer = null;
  }
  const snapshot = save ?? pending;
  pending = null;
  if (!snapshot) return;
  if (lastSaveReport.storageReadBlocked || lastSaveReport.preserveRawPrimary) {
    // Keep session read-only in memory so unreadable or unbacked-up corrupt SAVE_KEY data is never overwritten.
    return;
  }
  const storage = safeStorage();
  if (!storage) {
    lastWriteError = "storage-unavailable";
    lastSaveReport.writeFailed = true;
    for (const listener of errorListeners) listener("write-failed");
    return;
  }
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    lastWriteError = null;
    lastSaveReport.writeFailed = false;
    lastSaveReport.preserveRawPrimary = false;
  } catch (err) {
    lastWriteError = err instanceof Error ? err.message : "write-failed";
    lastSaveReport.writeFailed = true;
    for (const listener of errorListeners) listener("write-failed");
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
  timer = globalThis.setTimeout(() => {
    timer = null;
    flushSaveInternal(null);
  }, 220);
}

export function flushSave(save?: GameSave): void {
  if (save) pending = save;
  flushSaveInternal(null);
}
