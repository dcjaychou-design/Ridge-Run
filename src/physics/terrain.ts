import { BIOME_PERIOD, START_X } from "../constants";
import { smoothstep } from "../utils";

/**
 * Endless ridge profile. `x` is world metres.
 * Left of the start line the ground drops away steeply, and the game clamps
 * the car's X before the fall, so the world has no visible wall.
 *
 * Every 2000 m the biome cycle repeats with progressively taller relief. The
 * extra amplitude ramps in over the first 140 m of a cycle so the surface
 * stays continuous at the loop seam.
 */
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
    5.6 * Math.sin(x * 0.029 + 0.55) +
    2.7 * Math.sin(x * 0.073 + 2.1) +
    1.05 * Math.sin(x * 0.172 + 1.35);
  return base * ramp * difficulty;
}

export function slopeAt(x: number): number {
  const h = 0.18;
  return (heightAt(x + h) - heightAt(x - h)) / (h * 2);
}
