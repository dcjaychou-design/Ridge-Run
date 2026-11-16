import test from "node:test";
import assert from "node:assert/strict";
import { heightAt, setWorldSeed } from "../src/physics/terrain.ts";
import { StrataCache } from "../src/render/StrataCache.ts";
import { fbm } from "../src/render/scenery.ts";

test("strata paths reuse world geometry and refresh when the challenge seed changes", () => {
  const original = globalThis.Path2D;
  class TestPath {
    points: number[][] = [];
    moveTo(x: number, y: number) { this.points.push([x, y]); }
    lineTo(x: number, y: number) { this.points.push([x, y]); }
  }
  globalThis.Path2D = TestPath as unknown as typeof Path2D;
  try {
    setWorldSeed(0);
    const cache = new StrataCache();
    const first = cache.get(80, 95)[0]!;
    assert.equal(cache.get(81, 94)[0], first, "camera motion must reuse the existing paths");
    setWorldSeed(1234);
    const changed = cache.get(80, 95)[0]!;
    assert.notEqual(changed, first, "daily/challenge terrain must not inherit the old seed");
    for (let layer = 0; layer < changed.length; layer++) {
      const path = changed[layer] as unknown as TestPath;
      for (const [x, y] of path.points) {
        const expected = heightAt(x!) + 0.38 + layer * 0.78 + (fbm(x! * 0.24, layer * 17) - 0.5) * 0.85;
        assert.ok(Math.abs(y! - expected) < 1e-10);
      }
    }
    for (let x = 200; x < 1000; x += 24) cache.get(x, x + 36);
    assert.ok((cache as unknown as { tiles: Map<number, Path2D[]> }).tiles.size <= 24,
      "long runs must not accumulate unbounded terrain paths");
  } finally { globalThis.Path2D = original; setWorldSeed(0); }
});
