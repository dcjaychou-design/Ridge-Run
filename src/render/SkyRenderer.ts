import type { BiomePalette, RenderContext } from "../types";
import { hash, TAU, withAlpha } from "../utils";

/** Palette-driven sky: alpine glow, glacier dawn, canyon sunset, night aurora. */
export class SkyRenderer {
  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H, palette: p } = rc;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.26, p.skyUpper);
    g.addColorStop(0.48, p.skyMid);
    g.addColorStop(0.62, p.skyLow);
    g.addColorStop(0.75, p.skyHorizon);
    g.addColorStop(0.88, p.sunCore);
    g.addColorStop(1, p.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    this.drawStars(ctx, W, H, p, rc.time);
    if (p.aurora > 0.02) this.drawAurora(ctx, W, H, rc.time, p.aurora);
    this.drawSun(ctx, W, H, p);
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
    const count = Math.round(18 + p.starAlpha * 38);
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
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    intensity: number,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let band = 0; band < 3; band++) {
      const base = H * (0.15 + band * 0.055);
      const amp = H * (0.034 + band * 0.016);
      const g = ctx.createLinearGradient(0, base - amp * 3, 0, base + H * 0.11);
      g.addColorStop(0, withAlpha("#4fd6bd", 0));
      g.addColorStop(0.3, withAlpha("#4fd6bd", 0.11 * intensity));
      g.addColorStop(0.55, withAlpha("#89d8c8", 0.17 * intensity));
      g.addColorStop(0.7, withAlpha("#b7ffe9", 0.08 * intensity));
      g.addColorStop(1, withAlpha("#1d5354", 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      const step = 14;
      ctx.moveTo(-20, base);
      for (let x = -20; x <= W + 20; x += step) {
        const y =
          base +
          Math.sin(x * 0.004 + t * 0.35 + band * 1.7) * amp +
          Math.sin(x * 0.009 - t * 0.22 + band * 0.8) * amp * 0.38;
        ctx.lineTo(x, y);
      }
      for (let x = W + 20; x >= -20; x -= step) {
        const y =
          base +
          H * 0.095 +
          Math.sin(x * 0.0035 + t * 0.28 + band * 1.4) * amp * 1.35;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
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
    const sunX = W * 0.73;
    const sunY = H * 0.49;
    const sunR = Math.max(30, Math.min(W, H) * 0.054);
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.sunAlpha);
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 7);
    glow.addColorStop(0, withAlpha(p.sunGlow, 0.44));
    glow.addColorStop(0.22, withAlpha(p.sunGlow, 0.2));
    glow.addColorStop(0.56, withAlpha(p.sunGlow, 0.06));
    glow.addColorStop(1, withAlpha(p.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 7, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    const disc = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    disc.addColorStop(0, p.sunCore);
    disc.addColorStop(0.65, p.sunGlow);
    disc.addColorStop(1, p.sunEdge);
    ctx.fillStyle = disc;
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
    const drift = t * 2.3;
    const clouds = [
      { y: 0.17, x: 0.17, w: 0.28, h: 0.045, alpha: 0.055 },
      { y: 0.27, x: 0.58, w: 0.33, h: 0.035, alpha: 0.08 },
      { y: 0.39, x: 0.1, w: 0.2, h: 0.025, alpha: 0.045 },
      { y: 0.22, x: 0.84, w: 0.24, h: 0.028, alpha: 0.05 },
    ];
    ctx.save();
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i]!;
      const x = ((c.x * W + drift * (0.45 + i * 0.1)) % (W + 500)) - 250;
      const y = c.y * H;
      const w = c.w * W;
      const h = c.h * H;
      const alpha = c.alpha * p.cloudAlpha;
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
      g.addColorStop(0, withAlpha(p.crestColor, alpha * 1.3));
      g.addColorStop(0.5, withAlpha(p.crestColor, alpha * 0.68));
      g.addColorStop(1, withAlpha(p.crestColor, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0.01, 0, TAU);
      ctx.fill();
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
