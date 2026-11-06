import { BIOME_PERIOD, START_X } from "../constants";
import { mulberry32, smoothstep } from "../utils";

/**
 * Endless ridge profile. `x` is world metres.
 * Left of the start line the ground drops away steeply, and the game clamps
 * the car's X before the fall, so the world has no visible wall.
 *
 * Every 2000 m the biome cycle repeats with progressively taller relief. The
 * extra amplitude ramps in over the first 140 m of a cycle so the surface
 * stays continuous at the loop seam.
 *
 * When a daily / challenge seed is active, the same three sine terms get a
 * deterministic phase offset and a ±12% frequency modulation. Seed 0 is the
 * untouched standard ridge.
 */

interface RidgeParams {
  phaseA: number;
  phaseB: number;
  phaseC: number;
  freqA: number;
  freqB: number;
  freqC: number;
}

const DEFAULT_PARAMS: RidgeParams = {
  phaseA: 0.55,
  phaseB: 2.1,
  phaseC: 1.35,
  freqA: 0.029,
  freqB: 0.073,
  freqC: 0.172,
};

let currentSeed = 0;
let params: RidgeParams = { ...DEFAULT_PARAMS };

type SeedListener = () => void;
const seedListeners = new Set<SeedListener>();

const TAU = Math.PI * 2;

function normalizeSeed(seed: number): number {
  const value = Math.floor(seed);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >>> 0;
}

function deriveParams(seed: number): RidgeParams {
  if (seed === 0) return { ...DEFAULT_PARAMS };
  const rng = mulberry32(seed);
  return {
    phaseA: 0.55 + (rng() - 0.5) * TAU,
    phaseB: 2.1 + (rng() - 0.5) * TAU,
    phaseC: 1.35 + (rng() - 0.5) * TAU,
    // Keep every frequency within ±12% so the solver never meets a
    // pathological slope, while different seeds still feel distinct.
    freqA: 0.029 * (0.88 + rng() * 0.24),
    freqB: 0.073 * (0.88 + rng() * 0.24),
    freqC: 0.172 * (0.88 + rng() * 0.24),
  };
}

/** 0 keeps the standard ridge; any positive 32-bit value seeds the world. */
export function setWorldSeed(seed: number): void {
  const next = normalizeSeed(seed);
  if (next === currentSeed) return;
  currentSeed = next;
  params = deriveParams(next);
  for (const listener of seedListeners) listener();
}

export function getWorldSeed(): number {
  return currentSeed;
}

/** Lets caches (biome profiles) drop when the seed changes. */
export function onWorldSeedChange(listener: SeedListener): void {
  seedListeners.add(listener);
}

export function heightAt(x: number): number {
  const d = x - START_X;
  if (d < 0) return -Math.min(d * d * 0.35, 18);
  const ramp = smoothstep(7, 43, d);
  const cycle = Math.floor(Math.max(d, 0) / BIOME_PERIOD);
  const cycleBoost =
    cycle > 0
      ? Math.min(cycle * 0.12, 0.42) *
        smoothstep(0, 140, d - cycle * BIOME_PERIOD)
      : 0;
  const difficulty =
    0.82 + Math.min(Math.max(d, 0) / 2200, 1) * 0.38 + cycleBoost;
  const base =
    5.6 * Math.sin(x * params.freqA + params.phaseA) +
    2.7 * Math.sin(x * params.freqB + params.phaseB) +
    1.05 * Math.sin(x * params.freqC + params.phaseC);
  return base * ramp * difficulty;
}

export function slopeAt(x: number): number {
  const h = 0.18;
  return (heightAt(x + h) - heightAt(x - h)) / (h * 2);
}
