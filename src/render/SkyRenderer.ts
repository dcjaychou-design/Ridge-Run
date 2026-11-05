import type { RenderContext } from "../types";
import { hash, TAU } from "../utils";

/** Pre-dawn alpen glow, morning star sky, drifting cloud banks and birds. */
export class SkyRenderer {
  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H } = rc;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#081b20");
    g.addColorStop(0.26, "#15363b");
    g.addColorStop(0.48, "#46615e");
    g.addColorStop(0.62, "#a67358");
    g.addColorStop(0.75, "#e2a363");
    g.addColorStop(0.88, "#f4cd93");
    g.addColorStop(1, "#8a7b5e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint pre-dawn stars
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const x = hash(i * 3.1) * W;
      const y = hash(i * 7.7 + 2) * H * 0.3;
      const a = 0.12 + hash(i * 11.3) * 0.35;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#f4e8d2";
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.restore();

    this.drawSun(ctx, W, H);
    this.drawClouds(ctx, W, H, rc.time);
    this.drawBirds(ctx, W, H, rc.time);
  }

  private drawSun(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ): void {
    const sunX = W * 0.73;
    const sunY = H * 0.49;
    const sunR = Math.max(30, Math.min(W, H) * 0.054);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 7);
    glow.addColorStop(0, "rgba(255,218,147,.44)");
    glow.addColorStop(0.22, "rgba(245,175,101,.2)");
    glow.addColorStop(0.56, "rgba(227,119,67,.06)");
    glow.addColorStop(1, "rgba(227,119,67,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 7, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    const disc = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    disc.addColorStop(0, "#fff1c6");
    disc.addColorStop(0.65, "#f7c77f");
    disc.addColorStop(1, "#eaa05f");
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
  ): void {
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
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
      g.addColorStop(0, `rgba(244,232,210,${c.alpha})`);
      g.addColorStop(0.5, `rgba(244,220,184,${c.alpha * 0.55})`);
      g.addColorStop(1, "rgba(244,232,210,0)");
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
  ): void {
    ctx.save();
    ctx.strokeStyle = "rgba(10,24,22,.46)";
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
