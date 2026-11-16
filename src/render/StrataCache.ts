import { getWorldSeed, heightAt } from "../physics/terrain";
import { fbm } from "./scenery";

const TILE_METRES = 8;
const SAMPLE_STEP = 0.125;
const MAX_TILES = 24;

/** World-space paths survive camera movement, zoom and biome colour fades.
 * Keep only a small sliding window, and discard it when the route seed changes. */
export class StrataCache {
  private seed = -1;
  private tiles = new Map<number, Path2D[]>();
  private visible: Path2D[][] = [];

  get(left: number, right: number): readonly Path2D[][] {
    const seed = getWorldSeed();
    if (seed !== this.seed) { this.tiles.clear(); this.seed = seed; }
    const visible = this.visible;
    visible.length = 0;
    for (let tile = Math.floor(left / TILE_METRES); tile <= Math.floor(right / TILE_METRES); tile++) {
      let paths = this.tiles.get(tile);
      if (!paths) {
        paths = this.build(tile * TILE_METRES);
        if (this.tiles.size >= MAX_TILES) this.tiles.delete(this.tiles.keys().next().value!);
        this.tiles.set(tile, paths);
      }
      visible.push(paths);
    }
    return visible;
  }

  private build(start: number): Path2D[] {
    const paths = Array.from({ length: 9 }, () => new Path2D());
    for (let n = 0; n <= TILE_METRES / SAMPLE_STEP; n++) {
      const x = start + n * SAMPLE_STEP;
      const ground = heightAt(x);
      for (let layer = 0; layer < paths.length; layer++) {
        const y = ground + 0.38 + layer * 0.78 + (fbm(x * 0.24, layer * 17) - 0.5) * 0.85;
        if (n === 0) paths[layer]!.moveTo(x, y);
        else paths[layer]!.lineTo(x, y);
      }
    }
    return paths;
  }
}
