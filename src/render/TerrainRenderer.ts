import { STAGE_LENGTH, START_X } from "../constants";
import { stageInfoAt, visiblePatches, visibleVents } from "../physics/biomes";
import { heightAt, slopeAt } from "../physics/terrain";
import type { RenderContext, SurfacePatch, UpdraftVent } from "../types";
import { hash, mixHex, TAU, withAlpha } from "../utils";
import { fbm, pine, stone } from "./scenery";

const ICE_LAYERS = ["rgba(177,235,233,.28)", "rgba(177,235,233,.16)",
  "rgba(177,235,233,.1)", "rgba(177,235,233,.05)", "rgba(177,235,233,.015)"];
const MUD_LAYERS = ["rgba(84,51,39,.7)", "rgba(84,51,39,.5)",
  "rgba(84,51,39,.27)", "rgba(84,51,39,.12)", "rgba(84,51,39,.025)"];

interface ScreenPoint {
  x: number;
  y: number;
  wx: number;
  wy: number;
}

/** Playable ridge, biome-tinted cut faces, ice/mud bands, vents and gates. */
export class TerrainRenderer {
  private patchX: number[] = [];
  private patchY: number[] = [];
  private surfaceBuffer: ScreenPoint[] = [];
  private groundGradKey = "";
  private groundGrad: CanvasGradient | null = null;
  private grain: CanvasPattern | null = null;

  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H, view, palette: p } = rc;
    const pts = this.surfacePoints(rc, 5);
    if (!pts.length) return;
    this.drawWayside(rc);
    const land = new Path2D();
    land.moveTo(pts[0]!.x, H + 40);
    for (const point of pts) land.lineTo(point.x, point.y);
    land.lineTo(pts[pts.length - 1]!.x, H + 40);
    land.closePath();
    const gradKey = `${ctx.getTransform().a}|${H}|${p.groundTop}|${p.groundUpper}|${p.groundMid}|${p.groundBottom}`;
    if (!this.groundGrad || this.groundGradKey !== gradKey) {
      const g = ctx.createLinearGradient(0, H * 0.42, 0, H + 20);
      g.addColorStop(0, p.groundTop); g.addColorStop(0.3, p.groundUpper);
      g.addColorStop(0.72, p.groundMid); g.addColorStop(1, p.groundBottom);
      this.groundGrad = g; this.groundGradKey = gradKey;
    }
    ctx.fillStyle = this.groundGrad; ctx.fill(land);
    ctx.save(); ctx.clip(land);

    // Rock strata bend with the terrain but break independently of it.
    for (let layer = 0; layer < 9; layer++) {
      const depth = (0.38 + layer * 0.78) * view.scale;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i]!;
        const y = pt.y + depth + (fbm(pt.wx * 0.24, layer * 17) - 0.5) * view.scale * 0.85;
        if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
      }
      ctx.strokeStyle = layer % 3 === 0 ? withAlpha(p.strataColor, 0.2) : withAlpha(p.groundBottom, 0.3);
      ctx.lineWidth = view.scale * (layer % 3 === 0 ? 0.07 : 0.12);
      ctx.stroke();
    }
    // Embedded, bevelled rock fragments with stable world coordinates.
    const first = Math.floor(view.x - W / view.scale / 2) - 2;
    const end = Math.ceil(view.x + W / view.scale / 2) + 2;
    for (let i = first; i <= end; i++) {
      for (let j = 0; j < 5; j++) {
        const q = hash(i * 7.9 + j * 31);
        if (q < 0.35) continue;
        const wx = i + q;
        const x = this.toScreenX(rc, wx);
        const y = this.toScreenY(rc, heightAt(wx)) + (0.5 + j * 1.6 + q) * view.scale;
        if (y > H + 30) continue;
        const r = view.scale * (0.055 + q * 0.16);
        stone(ctx, x, y, r, mixHex(p.rockColor, p.groundBottom, 0.3),
          mixHex(p.rockColor, p.strataColor, 0.18), i + j * 91);
        ctx.strokeStyle = withAlpha(p.groundBottom, 0.25);
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x - r * 0.4, y + r * 2.8); ctx.stroke();
      }
    }
    if (!this.grain) this.grain = this.makeGrain(ctx);
    if (this.grain) {
      const matrix = new DOMMatrix().translate(W * 0.5 - view.x * view.scale, H * 0.5 - view.y * view.scale);
      this.grain.setTransform(matrix);
      ctx.fillStyle = this.grain; ctx.globalAlpha = 0.44;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    ctx.restore();

    // A soil shoulder and moss/snow lip read as a physical road thickness.
    const trace = (offset: number): void => {
      ctx.beginPath();
      pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y + offset) : ctx.lineTo(pt.x, pt.y + offset));
    };
    ctx.save(); ctx.clip(land); ctx.lineJoin = "round";
    trace(view.scale * 0.17);
    ctx.strokeStyle = mixHex(p.groundTop, p.strataColor, 0.35);
    ctx.lineWidth = view.scale * 0.38; ctx.stroke();
    trace(view.scale * 0.37);
    ctx.strokeStyle = withAlpha(p.groundBottom, 0.52); ctx.lineWidth = view.scale * 0.07; ctx.stroke();
    trace(0); ctx.strokeStyle = p.rim; ctx.lineWidth = view.scale * 0.16; ctx.stroke();
    // The shoulder catches light according to the real surface normal.
    // Batch similar normals so this costs three strokes for the whole ridge.
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const light = (dx * 0.83 + dy * 0.55) / Math.hypot(dx, dy);
        const group = light < 0.55 ? 0 : light < 0.85 ? 1 : 2;
        if (group !== band) continue;
        ctx.moveTo(a.x, a.y + view.scale * 0.06);
        ctx.lineTo(b.x, b.y + view.scale * 0.06);
      }
      ctx.strokeStyle = band === 0 ? withAlpha(p.groundBottom, 0.28) :
        withAlpha(mixHex(p.rim, p.sunCore, 0.25), band === 1 ? 0.12 : 0.4);
      ctx.lineWidth = view.scale * 0.13; ctx.stroke();
    }
    trace(0); ctx.strokeStyle = withAlpha(p.rimSoft, 0.42); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
    this.drawHazards(rc);
    this.drawGrass(rc);
    this.drawSurfaceDetail(rc);
  }

  private makeGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    const c = document.createElement("canvas"); c.width = c.height = 192;
    const k = c.getContext("2d")!;
    const image = k.createImageData(192, 192);
    for (let i = 0; i < image.data.length; i += 4) {
      const q = hash(i * 0.17), light = q > 0.5;
      image.data[i] = light ? 223 : 8;
      image.data[i + 1] = light ? 215 : 19;
      image.data[i + 2] = light ? 177 : 17;
      image.data[i + 3] = Math.abs(q - 0.5) * 70;
    }
    k.putImageData(image, 0, 0);
    return ctx.createPattern(c, "repeat");
  }

  private drawWayside(rc: RenderContext): void {
    const { ctx, width: W, view, palette: p } = rc;
    const left = Math.floor((view.x - W / view.scale / 2 - 8) / 6);
    const right = Math.ceil((view.x + W / view.scale / 2 + 8) / 6);
    for (let i = left; i <= right; i++) {
      const q = hash(i * 9.31), wx = i * 6 + q * 3;
      if (wx > START_X - 3 && wx < START_X + 13) continue;
      const x = this.toScreenX(rc, wx), y = this.toScreenY(rc, heightAt(wx)) + 4;
      if (p.treeAlpha > 0.1 && q > 0.33) {
        const h = (1.6 + q * 2.9) * view.scale;
        pine(ctx, x, y, h, mixHex(p.treeColor, p.nearTop, 0.3),
          mixHex(p.treeColor, p.rim, 0.28), i * 31, p.snowCap);
      } else if (q < 0.3) {
        stone(ctx, x, y, (0.25 + q) * view.scale, p.rockColor,
          mixHex(p.rockColor, p.crestColor, 0.25), i * 17);
      }
    }
  }

  private drawGrass(rc: RenderContext): void {
    const { ctx, width: W, view, palette: p, time } = rc;
    const first = Math.floor((view.x - W / view.scale / 2 - 1) / 0.28);
    const end = Math.ceil((view.x + W / view.scale / 2 + 1) / 0.28);
    ctx.save();
    for (let i = first; i <= end; i++) {
      const q = hash(i * 4.7), wx = i * 0.28;
      const x = this.toScreenX(rc, wx), y = this.toScreenY(rc, heightAt(wx));
      if (p.detailStyle === "snow" || p.detailStyle === "rock") {
        if (q > 0.8) stone(ctx, x, y + 2, view.scale * (0.04 + q * 0.07),
          p.rockColor, p.rimSoft, i);
        continue;
      }
      const h = view.scale * (0.04 + q * 0.15);
      const sway = Math.sin(time * 1.7 + wx * 2) * h * 0.18;
      ctx.strokeStyle = mixHex(p.groundTop, p.rim, q * 0.75);
      ctx.lineWidth = Math.max(0.65, view.scale * 0.017);
      ctx.beginPath(); ctx.moveTo(x, y + 1);
      ctx.quadraticCurveTo(x - h * 0.3, y - h * 0.7, x + sway, y - h);
      ctx.moveTo(x + 2, y + 1); ctx.lineTo(x + h * 0.4 + sway, y - h * 0.6); ctx.stroke();
      if (q > 0.94 && p.detailStyle === "pine") {
        ctx.fillStyle = i % 2 ? "#f2d99c" : "#d4c8cb";
        ctx.beginPath(); ctx.arc(x + sway, y - h, Math.max(1, view.scale * 0.025), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawMarkers(rc: RenderContext): void {
    this.marker(rc, START_X + 11, "START", true);

    const { width: W, view } = rc;
    const leftWorld = view.x - W / view.scale / 2 - 20;
    const rightWorld = view.x + W / view.scale / 2 + 20;
    const first = Math.max(
      100,
      Math.ceil((leftWorld - START_X) / 100) * 100,
    );
    for (let m = first; m <= rightWorld - START_X; m += 100) {
      if (m % STAGE_LENGTH === 0) this.stageGate(rc, START_X + m, m);
      else this.marker(rc, START_X + m, String(m), false);
    }
  }

  /** Warm updraft columns rising out of night-summit valleys. */
  drawVents(rc: RenderContext): void {
    const { width: W, view, palette: p, time } = rc;
    if (p.aurora < 0.15) return;
    const left = view.x - W / view.scale / 2 - 8;
    const right = view.x + W / view.scale / 2 + 8;
    for (const vent of visibleVents(left, right)) {
      this.drawVent(rc, vent, time);
    }
  }

  private drawVent(
    rc: RenderContext,
    vent: UpdraftVent,
    time: number,
  ): void {
    const { ctx, view } = rc;
    const s = view.scale;
    const baseY = heightAt(vent.x);
    const sx = this.toScreenX(rc, vent.x);
    const sy = this.toScreenY(rc, baseY);
    const height = 7.2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const column = ctx.createLinearGradient(0, sy - height * s, 0, sy);
    column.addColorStop(0, "rgba(240,177,94,0)");
    column.addColorStop(0.45, "rgba(240,177,94,.05)");
    column.addColorStop(0.9, "rgba(159,232,218,.1)");
    column.addColorStop(1, "rgba(159,232,218,0)");
    ctx.fillStyle = column;
    ctx.beginPath();
    ctx.ellipse(
      sx,
      sy - height * s * 0.5,
      vent.width * 0.42 * s,
      height * s * 0.5,
      0,
      0,
      TAU,
    );
    ctx.fill();

    for (let i = 0; i < 12; i++) {
      const seed = vent.phase + i * 1.73;
      const cycle = (time * 0.32 + hash(seed) + i * 0.083) % 1;
      const x =
        sx +
        (hash(seed * 2.3) - 0.5) * vent.width * 0.8 * s +
        Math.sin(time * 1.7 + i) * 3;
      const y = sy - cycle * height * s;
      const alpha = Math.sin(cycle * Math.PI) * 0.4;
      ctx.strokeStyle = withAlpha(
        i % 3 === 0 ? "#9fe8da" : "#f0b15e",
        alpha,
      );
      ctx.lineWidth = Math.max(1, s * 0.028);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(time * 2 + i) * 3, y - s * 0.55);
      ctx.stroke();
    }

    const groundGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * 2.4);
    groundGlow.addColorStop(0, "rgba(240,177,94,.16)");
    groundGlow.addColorStop(1, "rgba(240,177,94,0)");
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s * 2.4, s * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private surfacePoints(rc: RenderContext, stepPx: number): ScreenPoint[] {
    const { width: W, view } = rc;
    const pts = this.surfaceBuffer;
    let count = 0;
    for (let x = -20; x <= W + 20; x += stepPx) {
      const wx = view.x + (x - W * 0.5) / view.scale;
      const wy = heightAt(wx);
      const point = pts[count] ?? { x: 0, y: 0, wx: 0, wy: 0 };
      point.x = x; point.y = this.toScreenY(rc, wy); point.wx = wx; point.wy = wy;
      pts[count++] = point;
    }
    pts.length = count;
    return pts;
  }

  /* ---------- ice / mud ---------- */
  private drawHazards(rc: RenderContext): void {
    const { width: W, view } = rc;
    const left = view.x - W / view.scale / 2 - 6;
    const right = view.x + W / view.scale / 2 + 6;
    for (const patch of visiblePatches(left, right)) {
      if (patch.kind === "ice") this.drawIcePatch(rc, patch);
      else this.drawMudPatch(rc, patch);
    }
  }

  private fillPatchPoints(rc: RenderContext, patch: SurfacePatch): number {
    const patchX = this.patchX;
    const patchY = this.patchY;
    let count = 0;
    // Sample at the same visual density as the ridge. Long straight chords
    // used to cut through crests and leave ice floating above the road.
    const step = Math.min(0.35, 5 / rc.view.scale);
    for (let x = patch.start; x < patch.end; x += step) {
      patchX[count] = this.toScreenX(rc, x);
      patchY[count] = this.toScreenY(rc, heightAt(x));
      count++;
    }
    const endX = patch.end;
    patchX[count] = this.toScreenX(rc, endX);
    patchY[count] = this.toScreenY(rc, heightAt(endX));
    count++;
    return count;
  }

  private drawIcePatch(rc: RenderContext, patch: SurfacePatch): void {
    const { ctx, view } = rc;
    const count = this.fillPatchPoints(rc, patch);
    if (count < 2) return;
    const s = view.scale;
    const depth = Math.max(8, 0.8 * s);

    ctx.save();
    this.patchShape(ctx, count, depth);
    ctx.fillStyle = "rgba(126,206,220,.12)";
    ctx.fill();
    ctx.clip();

    // Translucent layers follow the slope instead of a screen-space gradient.
    for (let j = 0; j < 5; j++) {
      this.tracePatch(ctx, count, depth * (j + 0.5) / 5);
      ctx.strokeStyle = ICE_LAYERS[j]!;
      ctx.lineWidth = depth / 5 + 1;
      ctx.stroke();
    }

    // Fractures and submerged facets are anchored to world metres, so they
    // neither shimmer with camera movement nor multiply when the FOV changes.
    const first = Math.ceil(patch.start / 0.9);
    const end = Math.floor(patch.end / 0.9);
    for (let i = first; i <= end; i++) {
      const wx = i * 0.9, q = hash(i * 7.31);
      const x = this.toScreenX(rc, wx), y = this.toScreenY(rc, heightAt(wx));
      if (x < -s || x > rc.width + s) continue;
      const d = depth * (0.28 + q * 0.52);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan(slopeAt(wx)));
      ctx.fillStyle = withAlpha(q > 0.5 ? "#ddfbef" : "#376b80", 0.07 + q * 0.06);
      ctx.beginPath(); ctx.moveTo(-s * 0.22, 2); ctx.lineTo(s * 0.13, d * 0.42);
      ctx.lineTo(-s * 0.04, d); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(226,255,250,.42)"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-s * 0.18, 2);
      ctx.lineTo(s * 0.08, d * 0.4); ctx.lineTo(-s * 0.06, d * 0.58);
      ctx.lineTo(s * 0.13, d); ctx.stroke();
      ctx.strokeStyle = "rgba(72,124,145,.32)";
      ctx.beginPath(); ctx.moveTo(s * 0.08, d * 0.4);
      ctx.lineTo(s * 0.26, d * 0.35); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    this.tracePatch(ctx, count, 0.7);
    ctx.strokeStyle = "rgba(197,251,244,.38)"; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = "#b2ebe2"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  private tracePatch(ctx: CanvasRenderingContext2D, count: number, offset: number): void {
    ctx.beginPath();
    ctx.moveTo(this.patchX[0]!, this.patchY[0]! + offset);
    for (let i = 1; i < count; i++) {
      ctx.lineTo(this.patchX[i]!, this.patchY[i]! + offset);
    }
  }

  private patchShape(ctx: CanvasRenderingContext2D, count: number, depth: number): void {
    this.tracePatch(ctx, count, 0);
    const start = this.patchX[0]!, end = this.patchX[count - 1]!;
    const feather = Math.min(depth * 0.9, (end - start) * 0.25);
    for (let i = count - 1; i >= 0; i--) {
      const x = this.patchX[i]!;
      const t = Math.max(0, Math.min(1, (x - start) / feather, (end - x) / feather));
      ctx.lineTo(x, this.patchY[i]! + depth * t * t * (3 - 2 * t));
    }
    ctx.closePath();
  }

  private drawMudPatch(rc: RenderContext, patch: SurfacePatch): void {
    const { ctx, view } = rc;
    const count = this.fillPatchPoints(rc, patch);
    if (count < 2) return;
    const s = view.scale;
    const depth = Math.max(9, 0.9 * s);

    ctx.save();
    this.patchShape(ctx, count, depth);
    ctx.fillStyle = "rgba(48,30,23,.3)";
    ctx.fill();
    ctx.clip();

    for (let j = 0; j < 5; j++) {
      this.tracePatch(ctx, count, depth * (j + 0.5) / 5);
      ctx.strokeStyle = MUD_LAYERS[j]!;
      ctx.lineWidth = depth / 5 + 1; ctx.stroke();
    }

    const first = Math.ceil(patch.start / 0.7), end = Math.floor(patch.end / 0.7);
    for (let i = first; i <= end; i++) {
      const q = hash(i * 6.1), wx = i * 0.7;
      const x = this.toScreenX(rc, wx), y = this.toScreenY(rc, heightAt(wx));
      if (x < -s || x > rc.width + s) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan(slopeAt(wx)));
      // Small reflective wet patches sit in the ruts, under the road edge.
      const w = s * (0.1 + q * 0.22), d = depth * (0.14 + q * 0.4);
      ctx.fillStyle = "rgba(20,29,30,.34)";
      ctx.beginPath(); ctx.ellipse(0, d, w, Math.max(1, w * 0.12), -0.06, 0, TAU); ctx.fill();
      ctx.strokeStyle = withAlpha(rc.palette.sunCore, 0.13 + q * 0.16);
      ctx.lineWidth = 0.85;
      ctx.beginPath(); ctx.moveTo(-w * 0.75, d - 0.8); ctx.lineTo(w * 0.4, d - 0.8); ctx.stroke();
      if (q > 0.55) {
        stone(ctx, s * 0.17, depth * 0.64, s * (0.025 + q * 0.035), "#362a24", "#957654", i);
      }
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    this.tracePatch(ctx, count, 1);
    ctx.strokeStyle = "rgba(81,46,29,.9)"; ctx.lineWidth = Math.max(3, s * 0.13); ctx.stroke();
    ctx.strokeStyle = "rgba(207,155,105,.6)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  /* ---------- surface detail ---------- */
  private drawSurfaceDetail(rc: RenderContext): void {
    const { ctx, width: W, view, palette: p } = rc;
    const worldStart = Math.floor((view.x - W / view.scale / 2 - 4) / 2.6);
    const worldEnd = Math.ceil((view.x + W / view.scale / 2 + 4) / 2.6);
    ctx.save();
    for (let i = worldStart; i <= worldEnd; i++) {
      const r = hash(i * 7.17);
      const wx = i * 2.6 + r * 1.9;
      const x = this.toScreenX(rc, wx);
      const y = this.toScreenY(rc, heightAt(wx));
      if (x < -20 || x > W + 20) continue;

      if (p.detailStyle === "snow") {
        if (r > 0.52) {
          ctx.fillStyle = withAlpha(p.detailColor, 0.32 + r * 0.3);
          ctx.beginPath();
          ctx.ellipse(x, y - 1, 2.4 + r * 5.2, 0.9 + r * 1.3, 0, 0, TAU);
          ctx.fill();
        } else if (r < 0.12) {
          ctx.strokeStyle = withAlpha(p.rim, 0.3 + r);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y - 1);
          ctx.lineTo(x + 2.4, y - 5 - r * 8);
          ctx.moveTo(x + 1, y - 2);
          ctx.lineTo(x - 2, y - 4 - r * 5);
          ctx.stroke();
        }
        continue;
      }

      if (p.detailStyle === "rock") {
        if (r > 0.47) {
          ctx.strokeStyle = withAlpha(p.detailColor, 0.27 + r * 0.28);
          ctx.lineWidth = 1.3;
          const len = 5 + r * 14;
          ctx.beginPath();
          ctx.moveTo(x - len * 0.5, y - 1);
          ctx.lineTo(x + len * 0.5, y - 2);
          ctx.stroke();
        } else if (r < 0.14) {
          ctx.fillStyle = withAlpha(p.rockColor, 0.9);
          ctx.beginPath();
          ctx.moveTo(x - 3.4, y + 2);
          ctx.lineTo(x - 1, y - 4 - r * 12);
          ctx.lineTo(x + 3.4, y + 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = withAlpha(p.detailColor, 0.2);
          ctx.fillRect(x, y - 2, 1.4, 1.4);
        }
        continue;
      }

      if (p.detailStyle === "aurora") {
        if (r > 0.58) {
          ctx.strokeStyle = withAlpha(p.detailColor, 0.2 + r * 0.32);
          ctx.lineWidth = 1;
          const h = 3.5 + r * 7;
          ctx.beginPath();
          ctx.moveTo(x, y - 1);
          ctx.lineTo(x - 1.2, y - h);
          ctx.moveTo(x + 1, y - 1);
          ctx.lineTo(x + 2, y - h * 0.7);
          ctx.stroke();
        } else if (r < 0.12) {
          ctx.fillStyle = withAlpha(p.rockColor, 0.9);
          ctx.beginPath();
          ctx.moveTo(x - 3.5, y + 2);
          ctx.lineTo(x - 1, y - 4 - r * 16);
          ctx.lineTo(x + 3.5, y + 2);
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }

      // alpine pines / grass tufts
      if (r > 0.61) {
        ctx.strokeStyle = withAlpha(p.detailColor, 0.27 + r * 0.24);
        ctx.lineWidth = 1;
        const h = 4 + r * 8;
        ctx.beginPath();
        ctx.moveTo(x, y - 1);
        ctx.lineTo(x - 1.4, y - h);
        ctx.moveTo(x + 1, y - 1);
        ctx.lineTo(x + 2.2, y - h * 0.72);
        if (r > 0.84) {
          ctx.moveTo(x + 0.3, y - 1);
          ctx.lineTo(x + 0.8, y - h * 1.24);
        }
        ctx.stroke();
      } else if (r < 0.15) {
        ctx.fillStyle = withAlpha(p.rockColor, 0.8);
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y + 2);
        ctx.lineTo(x - 1, y - 4 - r * 16);
        ctx.lineTo(x + 3.5, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha(p.detailColor, 0.16);
        ctx.fillRect(x, y - 2, 1.4, 1.4);
      }
    }
    ctx.restore();
  }

  /* ---------- markers / gates ---------- */
  private marker(
    rc: RenderContext,
    x: number,
    label: string,
    start: boolean,
  ): void {
    const { ctx, width: W, view, time, palette: p } = rc;
    const gy = heightAt(x);
    const bx = this.toScreenX(rc, x);
    const by = this.toScreenY(rc, gy);
    if (bx < -80 || bx > W + 80) return;
    const s = view.scale;
    const poleH = (start ? 3.2 : 2.5) * s;
    ctx.save();
    ctx.strokeStyle = withAlpha("#f4e8d2", 0.7);
    ctx.lineWidth = Math.max(1, 0.055 * s);
    ctx.beginPath();
    ctx.moveTo(bx, by + 2);
    ctx.lineTo(bx, by - poleH);
    ctx.stroke();

    const flagH = Math.max(9, 0.52 * s);
    const flagW = Math.max(18, (start ? 1.5 : 1) * s);
    const flutter = Math.sin(time * 2.4 + x) * 2.2;
    ctx.fillStyle = start ? "#eb633a" : withAlpha(rc.stage.accent, 0.85);
    ctx.beginPath();
    ctx.moveTo(bx, by - poleH);
    ctx.lineTo(bx + flagW, by - poleH + flagH * 0.2 + flutter);
    ctx.lineTo(bx, by - poleH + flagH);
    ctx.closePath();
    ctx.fill();

    if (start || label !== "") {
      const pw = Math.max(28, (label.length > 3 ? 2.4 : 1.45) * s);
      const ph = Math.max(14, 0.48 * s);
      const px = bx - pw * 0.5;
      const py = by - poleH * 0.58;
      ctx.fillStyle = "rgba(6,17,13,.8)";
      ctx.strokeStyle = withAlpha(p.rimSoft, 0.32);
      ctx.lineWidth = 1;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      ctx.fillStyle = "#f4e8d2";
      ctx.font = `500 ${Math.max(8, Math.round(ph * 0.48))}px "IBM Plex Mono",monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx, py + ph * 0.52);
    }
    ctx.restore();
  }

  /** Brighter two-post stage gate every 500 m. */
  private stageGate(rc: RenderContext, x: number, distance: number): void {
    const { ctx, width: W, view, palette: p } = rc;
    const info = stageInfoAt(distance);
    const s = view.scale;
    const span = 1.55;
    const leftX = this.toScreenX(rc, x - span);
    const rightX = this.toScreenX(rc, x + span);
    const midX = this.toScreenX(rc, x);
    if (midX < -140 || midX > W + 140) return;
    const leftGround = this.toScreenY(rc, heightAt(x - span));
    const rightGround = this.toScreenY(rc, heightAt(x + span));
    const top = Math.min(leftGround, rightGround) - 3.35 * s;
    const bh = Math.max(24, 1.05 * s);
    const boardW = Math.max(70, 2.9 * s);
    const boardTop = top - bh;

    ctx.save();
    ctx.strokeStyle = withAlpha(p.rimSoft, 0.55);
    ctx.lineWidth = Math.max(1.2, 0.06 * s);
    ctx.beginPath();
    ctx.moveTo(leftX, leftGround + 2);
    ctx.lineTo(leftX, top);
    ctx.moveTo(rightX, rightGround + 2);
    ctx.lineTo(rightX, top);
    ctx.stroke();

    // crossbar + accent line
    ctx.strokeStyle = withAlpha(info.accent, 0.9);
    ctx.lineWidth = Math.max(1.6, 0.07 * s);
    ctx.beginPath();
    ctx.moveTo(leftX, top);
    ctx.lineTo(rightX, top);
    ctx.stroke();

    // pennants
    ctx.fillStyle = withAlpha(info.accent, 0.85);
    ctx.beginPath();
    ctx.moveTo(leftX, top + 1);
    ctx.lineTo(leftX + 8, top + 5);
    ctx.lineTo(leftX, top + 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rightX, top + 1);
    ctx.lineTo(rightX - 8, top + 5);
    ctx.lineTo(rightX, top + 10);
    ctx.closePath();
    ctx.fill();

    // board
    ctx.fillStyle = "rgba(4,13,10,.9)";
    ctx.fillRect(midX - boardW * 0.5, boardTop, boardW, bh);
    ctx.strokeStyle = withAlpha(info.accent, 0.65);
    ctx.lineWidth = 1;
    ctx.strokeRect(midX - boardW * 0.5 + 0.5, boardTop + 0.5, boardW - 1, bh - 1);
    ctx.fillStyle = withAlpha(info.accent, 0.9);
    ctx.fillRect(midX - boardW * 0.5, boardTop, boardW, Math.max(1.4, s * 0.045));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = withAlpha(info.accent, 0.95);
    ctx.font = `600 ${Math.max(7, Math.round(bh * 0.3))}px "IBM Plex Mono",monospace`;
    ctx.fillText(info.stageLabel, midX, boardTop + bh * 0.31);
    ctx.fillStyle = "#f4e8d2";
    ctx.font = `700 ${Math.max(8, Math.round(bh * 0.34))}px "Noto Sans SC",sans-serif`;
    ctx.fillText(info.name, midX, boardTop + bh * 0.7);
    ctx.restore();
  }

  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
