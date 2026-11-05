import { STAGE_LENGTH, START_X } from "../constants";
import { stageInfoAt, visiblePatches, visibleVents } from "../physics/biomes";
import { heightAt } from "../physics/terrain";
import type { RenderContext, SurfacePatch, UpdraftVent } from "../types";
import { hash, TAU, withAlpha } from "../utils";

interface ScreenPoint {
  x: number;
  y: number;
  wx: number;
  wy: number;
}

/** Playable ridge, biome-tinted cut faces, ice/mud bands, vents and gates. */
export class TerrainRenderer {
  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H, view, palette: p } = rc;
    const pts = this.surfacePoints(rc, 6);
    if (!pts.length) return;

    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, H + 30);
    for (const point of pts) ctx.lineTo(point.x, point.y);
    ctx.lineTo(pts[pts.length - 1]!.x, H + 30);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H + 20);
    g.addColorStop(0, p.groundTop);
    g.addColorStop(0.36, p.groundUpper);
    g.addColorStop(0.74, p.groundMid);
    g.addColorStop(1, p.groundBottom);
    ctx.fillStyle = g;
    ctx.fill();

    this.drawHazards(rc);

    // topographic cut lines under the crest
    ctx.save();
    for (let layer = 1; layer <= 4; layer++) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const point = pts[i]!;
        const yy = point.y + layer * Math.max(12, view.scale * 0.58);
        if (i === 0) ctx.moveTo(point.x, yy);
        else ctx.lineTo(point.x, yy);
      }
      const alpha =
        layer === 1 ? 0.26 : layer === 3 ? 0.13 : layer === 2 ? 0.07 : 0.05;
      ctx.strokeStyle = withAlpha(p.strataColor, alpha);
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
      ctx.strokeStyle = withAlpha(p.strataColor, 0.035 + hash(i * 5.2) * 0.05);
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

    // rim light: biome-tinted, still unmistakably Alpine Dusk
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const point = pts[i]!;
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = withAlpha(p.rimHalo, p.nightFactor > 0.5 ? 0.24 : 0.3);
    ctx.lineWidth = 9;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.strokeStyle = p.rim;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(p.rimSoft, 0.52);
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
    const pts: ScreenPoint[] = [];
    for (let x = -20; x <= W + 20; x += stepPx) {
      const wx = view.x + (x - W * 0.5) / view.scale;
      const wy = heightAt(wx);
      pts.push({ x, y: this.toScreenY(rc, wy), wx, wy });
    }
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

  private patchPoints(rc: RenderContext, patch: SurfacePatch): number[][] {
    const pts: number[][] = [];
    const step = 2.4;
    for (let x = patch.start; x < patch.end; x += step) {
      pts.push([this.toScreenX(rc, x), this.toScreenY(rc, heightAt(x)), x]);
    }
    const endX = patch.end;
    pts.push([
      this.toScreenX(rc, endX),
      this.toScreenY(rc, heightAt(endX)),
      endX,
    ]);
    return pts;
  }

  private drawIcePatch(rc: RenderContext, patch: SurfacePatch): void {
    const { ctx, view } = rc;
    const pts = this.patchPoints(rc, patch);
    if (pts.length < 2) return;
    const depth = Math.max(7, 1.3 * view.scale);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]![0]!, pts[i]![1]!);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i]![0]!, pts[i]![1]! + depth);
    }
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, pts[0]![1]!, 0, pts[0]![1]! + depth);
    fill.addColorStop(0, "rgba(137,216,200,.34)");
    fill.addColorStop(0.5, "rgba(137,216,200,.14)");
    fill.addColorStop(1, "rgba(137,216,200,.02)");
    ctx.fillStyle = fill;
    ctx.fill();

    // crisp top edge
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]![0]!, pts[i]![1]!);
    }
    ctx.strokeStyle = "rgba(137,216,200,.28)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = "#89d8c8";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // crystalline zigzags inside the sheet
    ctx.strokeStyle = "rgba(226,255,250,.44)";
    ctx.lineWidth = 1;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const x = pts[i]![0]!;
      const y = pts[i]![1]!;
      const len = 5 + hash(i * 4.7 + patch.start) * 13;
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x - len * 0.4, y + depth * 0.5);
      ctx.lineTo(x + len * 0.3, y + depth * 0.38);
      ctx.lineTo(x - len * 0.18, y + depth * 0.78);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMudPatch(rc: RenderContext, patch: SurfacePatch): void {
    const { ctx, view } = rc;
    const pts = this.patchPoints(rc, patch);
    if (pts.length < 2) return;
    const depth = Math.max(9, 1.6 * view.scale);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]![0]!, pts[i]![1]!);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i]![0]!, pts[i]![1]! + depth);
    }
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, pts[0]![1]!, 0, pts[0]![1]! + depth);
    fill.addColorStop(0, "rgba(86,49,28,.64)");
    fill.addColorStop(0.5, "rgba(62,34,19,.42)");
    fill.addColorStop(1, "rgba(36,19,11,.08)");
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]![0]!, pts[i]![1]!);
    }
    ctx.strokeStyle = "rgba(126,78,42,.55)";
    ctx.lineWidth = Math.max(3, view.scale * 0.12);
    ctx.stroke();
    ctx.strokeStyle = "rgba(202,148,94,.4)";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(111,70,40,.9)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // bubbles and slop
    for (let i = 1; i < pts.length - 1; i += 2) {
      const r = hash(i * 6.1 + patch.start);
      const x = pts[i]![0]! + (r - 0.5) * 8;
      const y = pts[i]![1]! + 3 + r * depth * 0.55;
      ctx.fillStyle = `rgba(28,15,9,${0.22 + r * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.4 + r * 3.4, 0.8 + r * 1.3, 0, 0, TAU);
      ctx.fill();
      if (r > 0.58) {
        ctx.strokeStyle = `rgba(214,164,106,${0.18 + r * 0.16})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 1.8 + r * 2.6, Math.PI * 0.15, Math.PI * 1.4);
        ctx.stroke();
      }
    }
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
