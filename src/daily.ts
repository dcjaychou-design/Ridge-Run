import {
  DAILY_FAIR_LEVEL,
  DAILY_FIRST_BOUNTY,
  DAILY_FIRST_MIN_DISTANCE,
  DAILY_RECORD_BOUNTY,
  DAILY_RECORD_MIN_DISTANCE,
  VEHICLE_ORDER,
} from "./constants";
import type { GameSave, UpgradeLevels, VehicleId } from "./types";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** UTC calendar day used by the daily trial, e.g. `"2026-11-06"`. */
export function utcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY_PATTERN.test(value);
}

/** FNV-1a over the date string, guaranteed non-zero so seed 0 stays standard. */
export function dailySeedFor(dateKey: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash >>>= 0;
  return hash === 0 ? 1 : hash;
}

/** The official daily machine: the seed itself picks one of the three rigs. */
export function dailyVehicleFor(seed: number): VehicleId {
  const index = (seed >>> 0) % VEHICLE_ORDER.length;
  return VEHICLE_ORDER[index]!;
}

/** Everyone races the daily in the same Lv.5 spec, even locked vehicles. */
export function fairUpgrades(): UpgradeLevels {
  return {
    engine: DAILY_FAIR_LEVEL,
    suspension: DAILY_FAIR_LEVEL,
    tires: DAILY_FAIR_LEVEL,
    fuel: DAILY_FAIR_LEVEL,
  };
}

/**
 * Roll the daily board over at UTC midnight. Coins, the standard PB and the
 * garage are deliberately untouched.
 */
export function refreshDaily(
  save: GameSave,
  today: string = utcDateKey(),
): boolean {
  if (save.dailyDate === today) return false;
  save.dailyDate = today;
  save.dailyBest = 0;
  save.dailyFirstClaimed = false;
  save.dailyGhost = null;
  return true;
}

export function seedHex(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export interface DailySettlement {
  dailyRecord: boolean;
  firstClaim: boolean;
  bounty: number;
}

/**
 * Apply a finished daily run to the save. The first run over 150 m pays the
 * daily bounty once; every run over 200 m that improves the day's best pays
 * the record bounty.
 */
export function settleDaily(
  save: GameSave,
  finalDistance: number,
): DailySettlement {
  const previousBest = save.dailyBest;
  const dailyRecord = finalDistance > previousBest;
  let firstClaim = false;
  let bounty = 0;

  if (!save.dailyFirstClaimed && finalDistance > DAILY_FIRST_MIN_DISTANCE) {
    save.dailyFirstClaimed = true;
    firstClaim = true;
    bounty += DAILY_FIRST_BOUNTY;
  }
  if (
    finalDistance > DAILY_RECORD_MIN_DISTANCE &&
    finalDistance > previousBest
  ) {
    bounty += DAILY_RECORD_BOUNTY;
  }
  if (dailyRecord) save.dailyBest = finalDistance;

  return { dailyRecord, firstClaim, bounty };
}
