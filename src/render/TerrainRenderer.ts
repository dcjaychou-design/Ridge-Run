import { START_X } from "../constants";
import { heightAt } from "../physics/terrain";
import type { RenderContext } from "../types";
import { hash } from "../utils";

interface ScreenPoint {
  x: number;
  y: number;
  wx: number;
  wy: number;
}

/** Playable ridge, cut-face strata, start flag and 100 m milestone signs. */
export class TerrainRenderer {
  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H, view } = rc;
    const pts = this.surfacePoints(rc, 6);
    if (!pts.length) return;

    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, H + 30);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts[pts.length - 1]!.x, H + 30);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H + 20);
    g.addColorStop(0, "#214638");
    g.addColorStop(0.36, "#102a20");
    g.addColorStop(0.74, "#0a1d17");
    g.addColorStop(1, "#05120e");
    ctx.fillStyle = g;
    ctx.fill();

    // topographic cut lines under the crest
    ctx.save();
    ctx.globalAlpha = 0.24;
    for (let layer = 1; layer <= 4; layer++) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const yy = p.y + layer * Math.max(12, view.scale * 0.58);
        if (i === 0) ctx.moveTo(p.x, yy);
        else ctx.lineTo(p.x, yy);
      }
      ctx.strokeStyle =
        layer === 1
          ? "rgba(226,174,103,.26)"
          : layer === 3
            ? "rgba(226,174,103,.13)"
            : "rgba(226,174,103,.07)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // fine strata running through the cut face
    ctx.save();
    for (let i = 0; i < 17; i++) {
      const wx =
        view.x - W / view.scale / 2 + (i / 16) * (W / view.scale) + hash(i * 3.1) * 5;
      const x = this.toScreenX(rc, wx);
      const y = this.toScreenY(rc, heightAt(wx));
      const len = 8 + hash(i * 9.7) * 34;
      ctx.strokeStyle = `rgba(222,169,100,${0.035 + hash(i * 5.2) * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 18 + hash(i * 2.3) * 42);
      ctx.lineTo(
        x + (hash(i * 7.4) - 0.5) * 22,
        y + 18 + hash(i * 2.3) * 42 + len,
      );
      ctx.stroke();
    }
    ctx.restore();

    // warm rim light
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(235,99,58,.3)";
    ctx.lineWidth = 9;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.strokeStyle = "#e9ae60";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,238,198,.52)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    this.drawSurfaceDetail(rc);
  }

  drawMarkers(rc: RenderContext): void {
    this.marker(rc, START_X + 11, "START", true);

    const { width: W, view } = rc;
    const leftWorld = view.x - W / view.scale / 2 - 20;
    const rightWorld = view.x + W / view.scale / 2 + 20;
    const first = Math.max(100, Math.ceil((leftWorld - START_X) / 100) * 100);
    for (let m = first; m <= rightWorld - START_X; m += 100) {
      this.marker(rc, START_X + m, String(m), false);
    }
  }

  private surfacePoints(rc: RenderContext, stepPx: number): ScreenPoint[] {
    const { width: W, view } = rc;
    const pts: ScreenPoint[] = [];
    for (let x = -20; x <= W + 20; x += stepPx) {
      const wx = view.x + (x - W * 0.5) / view.scale;
      const wy = heightAt(wx);
      pts.push({ x, y: this.toScreenY(rc, wy), wx, wy });
    }
    return pts;
  }

  private drawSurfaceDetail(rc: RenderContext): void {
    const { ctx, width: W, view } = rc;
    const worldStart = Math.floor((view.x - W / view.scale / 2 - 4) / 2.6);
    const worldEnd = Math.ceil((view.x + W / view.scale / 2 + 4) / 2.6);
    ctx.save();
    for (let i = worldStart; i <= worldEnd; i++) {
      const r = hash(i * 7.17);
      const wx = i * 2.6 + r * 1.9;
      const x = this.toScreenX(rc, wx);
      const y = this.toScreenY(rc, heightAt(wx));
      if (x < -20 || x > W + 20) continue;
      if (r > 0.61) {
        ctx.strokeStyle = `rgba(230,181,112,${0.27 + r * 0.24})`;
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
        ctx.fillStyle = "rgba(36,58,46,.8)";
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y + 2);
        ctx.lineTo(x - 1, y - 4 - r * 16);
        ctx.lineTo(x + 3.5, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(239,190,117,.16)";
        ctx.fillRect(x, y - 2, 1.4, 1.4);
      }
    }
    ctx.restore();
  }

  private marker(
    rc: RenderContext,
    x: number,
    label: string,
    start: boolean,
  ): void {
    const { ctx, width: W, view, time } = rc;
    const gy = heightAt(x);
    const bx = this.toScreenX(rc, x);
    const by = this.toScreenY(rc, gy);
    if (bx < -80 || bx > W + 80) return;
    const s = view.scale;
    const poleH = (start ? 3.2 : 2.5) * s;
    ctx.save();
    ctx.strokeStyle = "rgba(242,230,207,.7)";
    ctx.lineWidth = Math.max(1, 0.055 * s);
    ctx.beginPath();
    ctx.moveTo(bx, by + 2);
    ctx.lineTo(bx, by - poleH);
    ctx.stroke();

    const flagH = Math.max(9, 0.52 * s);
    const flagW = Math.max(18, (start ? 1.5 : 1) * s);
    const flutter = Math.sin(time * 2.4 + x) * 2.2;
    ctx.fillStyle = start ? "#eb633a" : "rgba(226,164,91,.85)";
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
      ctx.strokeStyle = "rgba(244,232,210,.32)";
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

  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
