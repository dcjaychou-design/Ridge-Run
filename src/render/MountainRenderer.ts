import type { RenderContext } from "../types";
import { clamp, hash } from "../utils";

interface RidgePoint {
  x: number;
  y: number;
}

/** Three parallax ridge layers with sunlit crests and ridgeline pines. */
export class MountainRenderer {
  draw(rc: RenderContext, cameraX: number): void {
    const { width: W, height: H } = rc;
    this.layer(rc, cameraX, H * 0.7, H * 0.27, "#b2a58e", "#7a887e", 0.014, 0.45, false, false);
    this.layer(rc, cameraX, H * 0.77, H * 0.25, "#6b8077", "#3e594f", 0.038, 2.25, true, true);
    this.layer(rc, cameraX, H * 0.88, H * 0.22, "#2b4a3f", "#0c2620", 0.083, 3.9, true, true);

    const { ctx } = rc;
    const haze = ctx.createLinearGradient(0, H * 0.46, 0, H * 0.82);
    haze.addColorStop(0, "rgba(240,177,94,0)");
    haze.addColorStop(0.52, "rgba(240,177,94,.13)");
    haze.addColorStop(1, "rgba(9,25,21,.26)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.46, W, H * 0.36);
  }

  private ridgeValue(u: number, phase: number, detail: boolean): number {
    return (
      0.445 +
      0.285 * Math.sin(u * 2.05 + phase) +
      0.155 * Math.sin(u * 5.45 + phase * 1.73 + 1.1) +
      0.075 * Math.sin(u * 12.7 + phase * 0.62) +
      (detail
        ? 0.042 * Math.sin(u * 27.3 + Math.PI * 0.4) + 0.022 * Math.sin(u * 49.7)
        : 0)
    );
  }

  private layer(
    rc: RenderContext,
    cameraX: number,
    baseY: number,
    amp: number,
    colorTop: string,
    colorBottom: string,
    parallax: number,
    phase: number,
    detail: boolean,
    trees: boolean,
  ): void {
    const { ctx, width: W, height: H, view } = rc;
    const offset = cameraX * view.scale * parallax;
    const pts: RidgePoint[] = [];
    for (let x = -40; x <= W + 50; x += 7) {
      const u = (x + offset) * 0.001 + phase;
      const ridge = clamp(this.ridgeValue(u, phase, detail), 0.055, 1.1);
      pts.push({ x, y: baseY - amp * ridge });
    }

    ctx.beginPath();
    ctx.moveTo(-40, H + 10);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(W + 50, H + 10);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - amp, 0, baseY + H * 0.24);
    g.addColorStop(0, colorTop);
    g.addColorStop(0.46, colorBottom);
    g.addColorStop(1, colorBottom);
    ctx.fillStyle = g;
    ctx.fill();

    // A sunlit crest and tiny ridgeline pines give depth without competing
    // with the playable slope.
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#f4d7a2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y + 1.2);
      else ctx.lineTo(p.x, p.y + 1.2);
    }
    ctx.stroke();
    ctx.restore();

    if (!trees) return;

    ctx.save();
    for (let x = -30; x < W + 30; x += 16) {
      const q = hash(x * 0.071 + phase * 83.1);
      if (q < 0.53) continue;
      const u = (x + offset) * 0.001 + phase;
      const ridge = clamp(this.ridgeValue(u, phase, detail), 0.055, 1.1);
      const y = baseY - amp * ridge + 1;
      const h = 4 + q * 9;
      const w = h * 0.36;
      ctx.fillStyle = "rgba(8,25,20,.38)";
      ctx.beginPath();
      ctx.moveTo(x - w, y + 1);
      ctx.lineTo(x, y - h);
      ctx.lineTo(x + w, y + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
