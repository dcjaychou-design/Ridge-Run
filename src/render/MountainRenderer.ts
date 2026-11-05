import type { RenderContext } from "../types";
import { clamp, hash, withAlpha } from "../utils";

interface RidgePoint {
  x: number;
  y: number;
}

/** Three parallax ridge layers tinted by the current biome palette. */
export class MountainRenderer {
  draw(rc: RenderContext, cameraX: number): void {
    const { width: W, height: H, palette: p } = rc;
    this.layer(
      rc,
      cameraX,
      H * 0.7,
      H * 0.27,
      p.farTop,
      p.farBottom,
      0.014,
      0.45,
      false,
      false,
    );
    this.layer(
      rc,
      cameraX,
      H * 0.77,
      H * 0.25,
      p.midTop,
      p.midBottom,
      0.038,
      2.25,
      true,
      true,
    );
    this.layer(
      rc,
      cameraX,
      H * 0.88,
      H * 0.22,
      p.nearTop,
      p.nearBottom,
      0.083,
      3.9,
      true,
      true,
    );

    const { ctx } = rc;
    const haze = ctx.createLinearGradient(0, H * 0.46, 0, H * 0.82);
    haze.addColorStop(0, withAlpha(p.hazeColor, 0));
    haze.addColorStop(0.52, withAlpha(p.hazeColor, p.hazeAlpha));
    haze.addColorStop(1, withAlpha(p.groundBottom, 0.26));
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
    const { ctx, width: W, height: H, view, palette: p } = rc;
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

    // A lit crest and snow caps give depth without competing with the slope.
    ctx.save();
    ctx.globalAlpha = p.crestAlpha;
    ctx.strokeStyle = p.crestColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const point = pts[i]!;
      if (i === 0) ctx.moveTo(point.x, point.y + 1.2);
      else ctx.lineTo(point.x, point.y + 1.2);
    }
    ctx.stroke();
    if (p.snowCap > 0.01) {
      ctx.globalAlpha = p.snowCap * 0.55;
      ctx.strokeStyle = "#f7feff";
      ctx.lineWidth = 3.4;
      ctx.stroke();
      ctx.globalAlpha = p.snowCap;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    ctx.restore();

    if (!trees || p.treeAlpha < 0.02) return;

    ctx.save();
    ctx.fillStyle = withAlpha(p.treeColor, p.treeAlpha);
    for (let x = -30; x < W + 30; x += 16) {
      const q = hash(x * 0.071 + phase * 83.1);
      if (q < 0.53) continue;
      const u = (x + offset) * 0.001 + phase;
      const ridge = clamp(this.ridgeValue(u, phase, detail), 0.055, 1.1);
      const y = baseY - amp * ridge + 1;
      const h = 4 + q * 9;
      const w = h * 0.36;
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
