import test from "node:test";
import assert from "node:assert/strict";
import { STAGE_LENGTH } from "../src/constants.ts";
import { biomePaletteAt, stageInfoAt } from "../src/physics/biomes.ts";
import { MountainRenderer } from "../src/render/MountainRenderer.ts";
import { SkyRenderer } from "../src/render/SkyRenderer.ts";
import { VehicleRenderer } from "../src/render/VehicleRenderer.ts";
import { VEHICLES } from "../src/constants.ts";
import type { GhostRecord, RenderContext } from "../src/types.ts";

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

test("SkyRenderer quantizes cloud fades and reuses its canvas without reallocation", () => {
  const oldDoc = globalThis.document;
  let canvasAllocs = 0;
  let cloudClears = 0;
  let dimensionWrites = 0;
  const gradient = { addColorStop() {} };
  const makeContext = () => ({
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    getTransform: () => ({ a: 2, b: 0 }),
    setTransform() {},
    clearRect() { cloudClears++; },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    drawImage() {},
  });
  const ctx = makeContext();
  globalThis.document = {
    createElement: () => {
      canvasAllocs++;
      let w = 0, h = 0;
      const c = makeContext();
      return {
        get width() { return w; },
        set width(v: number) { w = v; dimensionWrites++; },
        get height() { return h; },
        set height(v: number) { h = v; dimensionWrites++; },
        getContext: () => c,
      };
    },
  } as unknown as Document;

  try {
    const renderer = new SkyRenderer();
    Object.assign(renderer, { drawStars() {}, drawSun() {}, drawLightShafts() {}, drawAurora() {}, drawBirds() {} });
    for (let i = 0; i < 40; i++) {
      const distance = 460 + i * 2;
      const rc: RenderContext = {
        ctx: ctx as unknown as CanvasRenderingContext2D,
        width: 1280,
        height: 720,
        time: i / 60,
        view: { x: 0, y: 0, scale: 36 },
        palette: biomePaletteAt(distance),
        stage: stageInfoAt(distance),
      };
      renderer.draw(rc);
    }
    assert.equal(canvasAllocs, 1, "cloud offscreen canvas should be allocated once");
    assert.equal(dimensionWrites, 2, "reused cloud buffer should not resize on palette fades");
    assert.ok(cloudClears > 0 && cloudClears < 20, `expected quantized cloud rebuilds (<20), got ${cloudClears}`);
  } finally {
    globalThis.document = oldDoc;
  }
});

test("biome palette detailMix interpolates smoothly across every transition", () => {
  for (let stage = 0; stage < 4; stage++) {
    const boundary = (stage + 1) * STAGE_LENGTH;
    const before = biomePaletteAt(boundary - 20).detailMix;
    const seam = biomePaletteAt(boundary).detailMix;
    const after = biomePaletteAt(boundary + 20).detailMix;
    for (const mix of [before, seam, after]) {
      const total = mix.pine + mix.snow + mix.rock + mix.aurora;
      assert.ok(Math.abs(total - 1) < 1e-6, `detailMix should sum to 1, got ${total}`);
    }
    assert.notDeepEqual(before, seam);
    assert.notDeepEqual(seam, after);
  }
});

test("VehicleRenderer refreshes baked body sprites after webfonts load and tracks offscreen ghost bounds", async () => {
  const oldDoc = globalThis.document;
  let spriteBakes = 0;
  let resolveFonts!: () => void;
  const fontsReady = new Promise<void>((resolve) => {
    resolveFonts = resolve;
  });
  const gradient = { addColorStop() {} };
  const mockCtx = {
    font: "",
    textAlign: "left",
    textBaseline: "middle",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "",
    shadowBlur: 0,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (t: string) => ({ width: t.length * 7 }),
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arcTo() {},
    arc() {},
    ellipse() {},
    clip() {},
    fill() {},
    stroke() {},
    fillRect() {},
    fillText() {},
    drawImage() {},
  };
  globalThis.document = {
    fonts: { ready: fontsReady },
    createElement: () => {
      spriteBakes++;
      return { width: 0, height: 0, getContext: () => mockCtx };
    },
  } as unknown as Document;

  try {
    const renderer = new VehicleRenderer();
    const config = VEHICLES.moto;
    const record: GhostRecord = {
      version: 2,
      mode: "standard",
      seed: 1,
      vehicleId: "moto",
      distance: 250,
      samples: [],
    };
    const rc: RenderContext = {
      ctx: mockCtx as unknown as CanvasRenderingContext2D,
      width: 1000,
      height: 600,
      time: 0,
      view: { x: 100, y: 0, scale: 36 },
      palette: biomePaletteAt(0),
      stage: stageInfoAt(0),
    };

    const visible = renderer.drawGhost(
      rc, config, { x: 100, y: 0, angle: 0, finished: false }, record, "pb", 90,
    );
    assert.equal(visible.offscreen, false);
    assert.equal(spriteBakes, 1);

    // Repeating with different time animates wheels/antenna without re-baking body sprite.
    rc.time = 0.5;
    const verticalOut = renderer.drawGhost(
      rc, config, { x: 100, y: -20, angle: 0, finished: false }, record, "pb", 90,
    );
    assert.equal(verticalOut.offscreen, true, "ghost high above viewport must activate vertical radar");
    assert.equal(spriteBakes, 1);

    resolveFonts();
    await Promise.resolve();
    await Promise.resolve();
    renderer.drawGhost(
      rc, config, { x: 100, y: 0, angle: 0, finished: false }, record, "pb", 90,
    );
    assert.equal(spriteBakes, 2, "fonts.ready should invalidate cached body sprites once");
  } finally {
    globalThis.document = oldDoc;
  }
});
