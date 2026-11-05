import {
  LEGACY_SAVE_KEY,
  MAX_UPGRADE_LEVEL,
  SAVE_KEY,
  VEHICLE_ORDER,
} from "./constants";
import type {
  GameSave,
  UpgradeKey,
  UpgradeLevels,
  VehicleId,
} from "./types";
import { clamp } from "./utils";

const UPGRADE_KEYS: UpgradeKey[] = ["engine", "suspension", "tires", "fuel"];

export function defaultUpgradeLevels(): UpgradeLevels {
  return { engine: 1, suspension: 1, tires: 1, fuel: 1 };
}

export function defaultSave(): GameSave {
  return {
    best: 0,
    coins: 0,
    muted: false,
    selectedVehicle: "rally",
    unlockedVehicles: ["rally"],
    upgrades: {
      rally: defaultUpgradeLevels(),
      moto: defaultUpgradeLevels(),
      truck: defaultUpgradeLevels(),
    },
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

function normalize(raw: unknown): GameSave {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const save = defaultSave();

  save.best = Math.max(0, Math.floor(Number(source.best) || 0));
  save.coins = Math.max(0, Math.floor(Number(source.coins) || 0));
  save.muted = !!source.muted;

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
