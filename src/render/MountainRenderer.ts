import type { BiomePalette, RenderContext } from "../types";
import { clamp, hash, mixHex, withAlpha } from "../utils";
import { fbm, noise, pine } from "./scenery";

interface Point { x: number; y: number }
interface SceneryCache { canvas: HTMLCanvasElement; key: string; origin: number }

/** Sculpted massifs, glacial snowfields and independent forest parallax. */
export class MountainRenderer {
  private caches: SceneryCache[] = [];
  private paletteRef: BiomePalette | null = null;
  private paletteKey = "";
  private mistKey = "";
  private mistGradients: CanvasGradient[] = [];

  draw(rc: RenderContext, cameraX: number): void {
    const { ctx, width: W, height: H, palette: p } = rc;
    if (this.paletteRef !== p) {
      this.paletteRef = p;
      this.paletteKey = [p.farTop, p.farBottom, p.midTop, p.midBottom,
        p.nearTop, p.nearBottom, p.crestColor, p.treeColor, p.skyHorizon]
        .map(c => c.replace(/[0-9a-f]{2}/gi, v =>
          Math.min(255, Math.round(parseInt(v, 16) / 8) * 8).toString(16).padStart(2, "0"))).join("");
    }
    const mistKey = `${H}:${p.hazeColor}:${ctx.getTransform().a}`;
    if (this.mistKey !== mistKey) {
      this.mistKey = mistKey; this.mistGradients.length = 0;
      for (let depth = 0; depth < 3; depth++) {
        const y = H * (0.58 + depth * 0.075);
        const mist = ctx.createLinearGradient(0, y - H * 0.04, 0, y + H * 0.17);
        mist.addColorStop(0, withAlpha(p.hazeColor, 0));
        mist.addColorStop(0.45, withAlpha(p.hazeColor, depth === 0 ? 0.14 : 0.07));
        mist.addColorStop(1, withAlpha(p.hazeColor, 0));
        this.mistGradients.push(mist);
      }
    }
    for (let depth = 0; depth < 4; depth++) {
      const offset = cameraX * [0.55, 1.25, 2.9, 5.6][depth]!;
      const origin = Math.floor(offset / 256) * 256 - 256;
      const key = `${W}:${H}:${origin}:${this.paletteKey}:${Math.round(p.treeAlpha * 64)}`;
      let cache = this.caches[depth];
      if (!cache || cache.key !== key) {
        const canvas = cache?.canvas ?? document.createElement("canvas");
        canvas.width = Math.ceil(W + 768);
        canvas.height = H;
        const c = canvas.getContext("2d")!;
        c.translate(-origin, 0);
        if (depth < 2) this.massif(c, rc, origin, canvas.width, depth);
        else this.forest(c, rc, origin, canvas.width, depth);
        cache = { canvas, key, origin };
        this.caches[depth] = cache;
      }
      ctx.drawImage(cache.canvas, cache.origin - offset, 0);
      if (depth < 3) {
        const y = H * (0.58 + depth * 0.075);
        ctx.fillStyle = this.mistGradients[depth]!;
        ctx.fillRect(0, y - H * 0.04, W, H * 0.21);
      }
    }
  }

  private elevation(x: number, H: number, depth: number, canyon: number): number {
    const u = x / H, span = depth === 0 ? 0.7 : 0.92;
    const cell = Math.floor(u / span);
    let peak = 0;
    for (let i = cell - 1; i <= cell + 1; i++) {
      const center = (i + 0.35 + hash(i * 3.1 + depth * 71) * 0.3) * span;
      const distance = Math.abs(u - center) / (span * 0.76);
      const alpine = Math.pow(Math.max(0, 1 - distance), 0.82);
      const terrace = clamp((1 - distance) * 2.7, 0, 1);
      const shape = alpine + (terrace - alpine) * canyon;
      peak = Math.max(peak, shape * (0.56 + hash(i * 7.3 + depth * 19) * 0.45));
    }
    const jagged = (fbm(u * 23, depth * 31) - 0.5) * 0.075;
    return H * ((depth === 0 ? 0.69 : 0.8) -
      (peak + jagged) * (depth === 0 ? 0.46 : 0.49));
  }

  private massif(
    ctx: CanvasRenderingContext2D, rc: RenderContext,
    origin: number, width: number, depth: number,
  ): void {
    const { height: H, palette: p } = rc;
    // Tree density is continuously blended by the biome system, unlike
    // detailStyle. It lets peaks morph into mesas without a boundary pop.
    const canyon = clamp(1 - p.treeAlpha / 0.24, 0, 1);
    const step = Math.max(9, H / 70);
    const first = Math.floor(origin / step) * step;
    const points: Point[] = [];
    for (let x = first; x < origin + width + step; x += step)
      points.push({ x, y: this.elevation(x, H, depth, canyon) });
    ctx.beginPath();
    ctx.moveTo(first, H);
    for (const pt of points) ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(origin + width + step, H);
    ctx.closePath();
    const top = depth === 0 ? p.farTop : p.midTop;
    const bottom = depth === 0 ? p.farBottom : p.midBottom;
    const fill = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.85);
    fill.addColorStop(0, mixHex(top, p.crestColor, 0.25));
    fill.addColorStop(0.45, top);
    fill.addColorStop(1, bottom);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // A continuous, broken snowline follows glacial basins. Large planes
    // share the same lighting across rock and snow, avoiding striped peaks.
    if (canyon < 0.99) {
      ctx.save(); ctx.globalAlpha = 1 - canyon;
      const snowline = H * (depth === 0 ? 0.44 : 0.43) + H * p.snowCap * 0.32;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      for (let i = points.length - 1; i >= 0; i--) {
        const pt = points[i]!;
        const reach = Math.max(0, snowline - pt.y);
        const tongue = 0.25 + fbm(pt.x / 55, depth * 29) * 0.92;
        ctx.lineTo(pt.x + step * 0.1, pt.y + reach * tongue);
      }
      ctx.closePath();
      const snow = ctx.createLinearGradient(0, H * 0.2, 0, snowline + H * 0.05);
      snow.addColorStop(0, mixHex("#faf4e0", p.crestColor, p.nightFactor * 0.75));
      snow.addColorStop(0.5, mixHex("#dce7df", top, 0.15));
      snow.addColorStop(1, mixHex(top, "#c9dddf", 0.5));
      ctx.fillStyle = snow; ctx.fill();
      ctx.restore();
    }
    for (let i = 4; i < points.length - 4; i += 4) {
      const a = points[i - 4]!, b = points[i]!, c = points[i + 4]!;
      const q = hash(Math.floor(b.x / step) + depth * 51);
      const footX = b.x + (noise(b.x / 180, depth * 37) - 0.7) * H * 0.56;
      const footY = b.y + H * (0.18 + q * 0.33);
      const shade = ctx.createLinearGradient(b.x, b.y, footX, footY);
      shade.addColorStop(0, withAlpha(mixHex(bottom, "#244a62", (1 - canyon) * 0.4), 0.2 + q * 0.18));
      shade.addColorStop(0.7, withAlpha(bottom, 0.12));
      shade.addColorStop(1, withAlpha(bottom, 0));
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(footX + H * 0.055, footY - H * 0.06);
      ctx.lineTo(footX, footY); ctx.closePath(); ctx.fill();
      const lit = ctx.createLinearGradient(b.x, b.y, footX, footY);
      lit.addColorStop(0, withAlpha(p.crestColor, 0.04 + q * 0.09));
      lit.addColorStop(1, withAlpha(p.crestColor, 0));
      ctx.fillStyle = lit;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y);
      ctx.lineTo(footX, footY); ctx.closePath(); ctx.fill();
      if (q > 0.36) {
        ctx.strokeStyle = withAlpha(bottom, 0.14); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(b.x, b.y + 2);
        ctx.lineTo(b.x - H * 0.035, b.y + H * 0.1);
        ctx.lineTo(footX + H * 0.025, footY - H * 0.08); ctx.stroke();
      }
    }
    if (canyon > 0.01) {
      ctx.save(); ctx.globalAlpha = canyon;
      ctx.strokeStyle = withAlpha(p.crestColor, 0.13); ctx.lineWidth = 2;
      for (let j = 0; j < 14; j++) {
        const y = H * (0.37 + j * 0.028);
        ctx.beginPath();
        for (let x = first; x < origin + width + step; x += step) {
          const yy = y + noise(x / 100, j) * H * 0.016;
          if (x === first) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private forest(
    ctx: CanvasRenderingContext2D, rc: RenderContext,
    origin: number, width: number, depth: number,
  ): void {
    const { height: H, palette: p } = rc;
    const base = (x: number): number => H * (depth === 2 ? 0.77 : 0.91) -
      fbm(x / H * 2.2, depth * 13) * H * (depth === 2 ? 0.24 : 0.22);
    const color = depth === 2 ? p.nearTop : p.nearBottom;
    ctx.beginPath(); ctx.moveTo(origin - 20, H);
    for (let x = origin - 20; x <= origin + width + 20; x += 10) ctx.lineTo(x, base(x));
    ctx.lineTo(origin + width + 20, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
    g.addColorStop(0, color); g.addColorStop(1, p.nearBottom);
    ctx.fillStyle = g; ctx.fill();
    if (p.treeAlpha < 0.01) return;
    ctx.save(); ctx.globalAlpha = clamp(p.treeAlpha / 0.25, 0, 1);
    const spacing = depth === 2 ? 12 : 18;
    const start = Math.floor((origin - 40) / spacing);
    const end = Math.ceil((origin + width + 40) / spacing);
    for (let i = start; i <= end; i++) {
      const q = hash(i * 3.7 + depth * 21), x = i * spacing + q * spacing;
      const h = H * (0.018 + q * (depth === 2 ? 0.06 : 0.12));
      pine(ctx, x, base(x) + h * 0.12, h, color,
        mixHex(color, p.crestColor, depth === 2 ? 0.1 : 0.15), i * 8.3, p.snowCap);
    }
    ctx.restore();
  }
}
