import type { BiomePalette, RenderContext } from "../types";
import { hash, TAU, withAlpha } from "../utils";

/** Palette-driven sky: alpine glow, glacier dawn, canyon sunset, night aurora. */
export class SkyRenderer {
  private cloudCache: { key: string; canvas: HTMLCanvasElement } | null = null;
  private skyGradKey = "";
  private skyGrad: CanvasGradient | null = null;
  private sunGradKey = "";
  private sunGlowGrad: CanvasGradient | null = null;
  private sunDiscGrad: CanvasGradient | null = null;
  private auroraSprites: HTMLCanvasElement[] = [];

  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H, palette: p } = rc;
    const skyKey = `${ctx.getTransform().a}|${H}|${p.skyTop}|${p.skyUpper}|${p.skyMid}|${p.skyLow}|${p.skyHorizon}|${p.sunCore}|${p.skyBottom}`;
    if (!this.skyGrad || this.skyGradKey !== skyKey) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, p.skyTop);
      g.addColorStop(0.26, p.skyUpper);
      g.addColorStop(0.48, p.skyMid);
      g.addColorStop(0.62, p.skyLow);
      g.addColorStop(0.75, p.skyHorizon);
      g.addColorStop(0.88, p.sunCore);
      g.addColorStop(1, p.skyBottom);
      this.skyGrad = g;
      this.skyGradKey = skyKey;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, W, H);

    this.drawStars(ctx, W, H, p, rc.time);
    if (p.aurora > 0.02) this.drawAurora(ctx, W, H, rc.time, p.aurora);
    this.drawSun(ctx, W, H, p);
    this.drawLightShafts(ctx, W, H, p);
    this.drawClouds(ctx, W, H, rc.time, p);
    this.drawBirds(ctx, W, H, rc.time, p);
  }

  private drawStars(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    p: BiomePalette,
    t: number,
  ): void {
    const count = Math.round(12 + p.starAlpha * 100);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x = hash(i * 3.1) * W;
      const y = hash(i * 7.7 + 2) * H * 0.33;
      const twinkle =
        0.72 + Math.sin(t * (0.9 + (i % 5) * 0.22) + i * 1.9) * 0.24;
      ctx.globalAlpha = Math.min(
        0.95,
        (0.14 + hash(i * 11.3) * 0.4) * p.starAlpha * twinkle,
      );
      ctx.fillStyle = i % 7 === 0 ? p.sunGlow : "#f4e8d2";
      const size = i % 11 === 0 ? 1.8 : 1.2;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  private drawAurora(
    ctx: CanvasRenderingContext2D, W: number, H: number, t: number, intensity: number,
  ): void {
    if (!this.auroraSprites.length) {
      for (const color of ["#73d9aa", "#66c8c6", "#9999dc"]) {
        const sprite = document.createElement("canvas"); sprite.width = 16; sprite.height = 256;
        const c = sprite.getContext("2d")!;
        const g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, withAlpha(color, 0));
        g.addColorStop(0.32, withAlpha(color, 0.12));
        g.addColorStop(0.72, withAlpha(color, 0.65));
        g.addColorStop(0.88, withAlpha(color, 0.85));
        g.addColorStop(1, withAlpha(color, 0));
        c.fillStyle = g; c.fillRect(0, 0, 16, 256);
        this.auroraSprites.push(sprite);
      }
    }
    ctx.save(); ctx.globalCompositeOperation = "screen";
    const columns = Math.ceil(W / 8);
    for (let band = 0; band < 3; band++) {
      for (let i = 0; i <= columns; i++) {
        const u = i / columns;
        const wave = Math.sin(u * 7 + t * 0.13 + band * 1.8) * 0.042 +
          Math.sin(u * 17 - t * 0.09 + band) * 0.014;
        const base = H * (0.27 + band * 0.055 + wave);
        const reach = H * (0.15 + 0.09 * (0.5 + Math.sin(u * 10 + band + t * 0.07) * 0.5));
        const filament = 0.72 + Math.sin(i * 0.14 + band * 2.3) * 0.2 +
          Math.sin(i * 1.73 + band) * 0.06;
        ctx.globalAlpha = intensity * Math.sin(u * Math.PI) * filament * (band === 2 ? 0.1 : 0.24);
        ctx.drawImage(this.auroraSprites[band]!, i * W / columns - 6, base - reach, W / columns + 12, reach);
      }
    }
    ctx.restore();
  }

  private drawSun(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    p: BiomePalette,
  ): void {
    if (p.sunAlpha < 0.04) return;
    const sunX = W * 0.76;
    const sunY = H * 0.32;
    const sunR = Math.max(18, Math.min(W, H) * 0.034);
    const sunKey = `${ctx.getTransform().a}|${W}|${H}|${p.sunGlow}|${p.sunCore}|${p.sunEdge}`;
    if (!this.sunGlowGrad || !this.sunDiscGrad || this.sunGradKey !== sunKey) {
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 7);
      glow.addColorStop(0, withAlpha(p.sunGlow, 0.44));
      glow.addColorStop(0.22, withAlpha(p.sunGlow, 0.2));
      glow.addColorStop(0.56, withAlpha(p.sunGlow, 0.06));
      glow.addColorStop(1, withAlpha(p.sunGlow, 0));
      const disc = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      disc.addColorStop(0, p.sunCore);
      disc.addColorStop(0.65, p.sunGlow);
      disc.addColorStop(1, p.sunEdge);
      this.sunGlowGrad = glow;
      this.sunDiscGrad = disc;
      this.sunGradKey = sunKey;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, p.sunAlpha + p.nightFactor * 0.5);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = this.sunGlowGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 7, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this.sunDiscGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawClouds(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    p: BiomePalette,
  ): void {
    if (p.cloudAlpha < 0.04) return;
    const key = p.sunCore + p.skyUpper;
    if (!this.cloudCache || this.cloudCache.key !== key) {
      const canvas = this.cloudCache?.canvas ?? document.createElement("canvas");
      canvas.width = 720; canvas.height = 180;
      const c = canvas.getContext("2d")!;
      for (let i = 0; i < 28; i++) {
        const x = 60 + hash(i * 3.3) * 600;
        const y = 82 + Math.sin(i * 2.3) * 18;
        const r = 22 + hash(i * 9.7) * 58;
        const cloud = c.createRadialGradient(x, y, 0, x, y, r);
        cloud.addColorStop(0, withAlpha(p.sunCore, 0.13));
        cloud.addColorStop(0.45, withAlpha(p.sunCore, 0.075));
        cloud.addColorStop(1, withAlpha(p.sunCore, 0));
        c.save(); c.translate(x, y); c.scale(1.7, 0.6); c.translate(-x, -y);
        c.fillStyle = cloud; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
      }
      // Feather every sprite boundary so cloud banks never reveal rectangles.
      c.globalCompositeOperation = "destination-in";
      const featherX = c.createLinearGradient(0, 0, 720, 0);
      featherX.addColorStop(0, "transparent"); featherX.addColorStop(0.18, "#fff");
      featherX.addColorStop(0.82, "#fff"); featherX.addColorStop(1, "transparent");
      c.fillStyle = featherX; c.fillRect(0, 0, 720, 180);
      const featherY = c.createLinearGradient(0, 0, 0, 180);
      featherY.addColorStop(0, "transparent"); featherY.addColorStop(0.3, "#fff");
      featherY.addColorStop(0.7, "#fff"); featherY.addColorStop(1, "transparent");
      c.fillStyle = featherY; c.fillRect(0, 0, 720, 180);
      this.cloudCache = { key, canvas };
    }
    ctx.save();
    ctx.globalAlpha = p.cloudAlpha;
    for (let i = 0; i < 5; i++) {
      const w = W * (0.48 + hash(i * 7.1) * 0.4);
      const x = ((hash(i * 3.7) * (W + w) + t * (2 + i * 0.4)) % (W + w)) - w;
      const y = H * (0.08 + i * 0.058);
      ctx.drawImage(this.cloudCache.canvas, x, y, w, H * (0.08 + i * 0.012));
    }
    ctx.restore();
  }

  private drawLightShafts(ctx: CanvasRenderingContext2D, W: number, H: number, p: BiomePalette): void {
    if (p.nightFactor > 0.8) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const x = W * 0.76, y = H * 0.32;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, H * 0.64);
    glow.addColorStop(0, withAlpha(p.sunGlow, 0.045 * p.sunAlpha));
    glow.addColorStop(0.45, withAlpha(p.sunGlow, 0.012 * p.sunAlpha));
    glow.addColorStop(1, withAlpha(p.sunGlow, 0));
    ctx.fillStyle = glow;
    for (let i = 0; i < 7; i++) {
      const a = 0.9 + i * 0.23;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * H, y + Math.sin(a) * H);
      ctx.lineTo(x + Math.cos(a + 0.06) * H, y + Math.sin(a + 0.06) * H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  private drawBirds(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    p: BiomePalette,
  ): void {
    if (p.birdAlpha < 0.04) return;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.treeColor, 0.46 * p.birdAlpha);
    ctx.lineWidth = 1;
    const bx = W * 0.2 + Math.sin(t * 0.08) * 20;
    const by = H * 0.22;
    for (let i = 0; i < 3; i++) {
      const x = bx + i * 18 + Math.sin(t * 0.3 + i) * 4;
      const y = by + i * 7;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.quadraticCurveTo(x - 2, y - 2.5, x, y);
      ctx.quadraticCurveTo(x + 2, y - 2.5, x + 5, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
