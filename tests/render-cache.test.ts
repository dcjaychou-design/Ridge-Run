import test from "node:test";
import assert from "node:assert/strict";
import { biomePaletteAt, stageInfoAt } from "../src/physics/biomes.ts";
import { MountainRenderer } from "../src/render/MountainRenderer.ts";
import { SkyRenderer } from "../src/render/SkyRenderer.ts";
import type { RenderContext } from "../src/types.ts";

function sceneryHarness() {
  let scale = 2;
  let paints = 0;
  const images: number[][] = [];
  const gradient = { addColorStop() {} };
  const context = {
    getTransform: () => ({ a: scale, b: 0 }),
    setTransform() {}, clearRect() {}, fillRect() {},
    createLinearGradient: () => gradient,
    drawImage: (_canvas: unknown, ...args: number[]) => images.push(args),
  };
  const oldDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  } as unknown as Document;
  const renderer = new MountainRenderer();
  // Count actual cache raster jobs, keeping the draw/caching call site intact.
  Object.assign(renderer, { massif() { paints++; }, forest() { paints++; } });
  const rc: RenderContext = {
    ctx: context as unknown as CanvasRenderingContext2D,
    width: 1440, height: 900, time: 0,
    view: { x: 0, y: 0, scale: 40 },
    palette: biomePaletteAt(460), stage: stageInfoAt(460),
  };
  return { renderer, rc, images, get paints() { return paints; },
    setScale(value: number) { scale = value; },
    restore() { globalThis.document = oldDocument; } };
}

test("biome fades spread scenery raster jobs across frames after warmup", () => {
  const h = sceneryHarness();
  try {
    h.renderer.draw(h.rc, 0);
    assert.equal(h.paints, 4);
    for (let frame = 1; frame <= 50; frame++) {
      h.rc.time = frame / 60;
      h.rc.palette = biomePaletteAt(460 + frame * 0.7);
      const previous = h.paints;
      h.renderer.draw(h.rc, frame * 0.1);
      assert.ok(h.paints - previous <= 1,
        `one biome fade frame rebuilt ${h.paints - previous} full scenery layers`);
    }
  } finally { h.restore(); }
});

test("slow aurora animation reuses its light field between samples", () => {
  const original = globalThis.document;
  let rasterBlits = 0;
  const gradient = { addColorStop() {} };
  const offscreen = {
    createLinearGradient: () => gradient,
    fillRect() {}, setTransform() {}, clearRect() {}, save() {}, restore() {},
    drawImage() { rasterBlits++; },
  };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => offscreen }) } as unknown as Document;
  try {
    const ctx = {
      getTransform: () => ({ a: 2, b: 0 }),
      createLinearGradient: () => gradient, fillRect() {}, save() {}, restore() {},
      drawImage() { rasterBlits++; },
    };
    const renderer = new SkyRenderer();
    Object.assign(renderer, { drawStars() {}, drawSun() {}, drawLightShafts() {}, drawClouds() {}, drawBirds() {} });
    const rc: RenderContext = {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920, height: 1080, time: 0,
      view: { x: 0, y: 0, scale: 40 }, palette: biomePaletteAt(1690), stage: stageInfoAt(1690),
    };
    renderer.draw(rc);
    assert.ok(rasterBlits > 500);
    const first = rasterBlits;
    for (const time of [0.01, 0.02, 0.03, 0.04]) { rc.time = time; renderer.draw(rc); }
    assert.equal(rasterBlits - first, 4, "distant light must not rebuild hundreds of filaments on every display frame");
    rc.time = 0.06; renderer.draw(rc);
    assert.ok(rasterBlits > first + 4, "aurora animation must keep moving");
  } finally { globalThis.document = original; }
});

test("scenery remains covered after reverse travel, teleports and DPR changes", () => {
  const h = sceneryHarness();
  try {
    for (const x of [0, 47, 95, -100, 2000, 0]) {
      h.images.length = 0;
      h.rc.time += 0.016;
      h.renderer.draw(h.rc, x);
      assert.equal(h.images.length, 4);
      for (const [left, top, width, height] of h.images) {
        assert.ok(left <= 0 && left + width! >= h.rc.width, `uncovered scenery at ${x}`);
        assert.equal(top, 0); assert.equal(height, h.rc.height);
      }
    }
    h.setScale(1);
    const previous = h.paints;
    h.renderer.draw(h.rc, 0);
    assert.equal(h.paints - previous, 4, "resolution changes must refresh every buffer");
  } finally { h.restore(); }
});
