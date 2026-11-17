import { heightAt, slopeAt } from "../physics/terrain";
import type { CarState, RenderContext } from "../types";
import { clamp, mixHex } from "../utils";

interface TrackMark { x: number; y: number; angle: number; born: number }
const MAX_MARKS = 320;

/** Bounded world-space tire impressions. Sampling never changes the solver. */
export class TrackRenderer {
  private marks: TrackMark[] = [];
  private lastX: number[] = [];
  private cursor = 0;
  private time = 0;

  clear(): void {
    this.marks.length = this.lastX.length = 0;
    this.cursor = this.time = 0;
  }

  update(car: CarState, dt: number): void {
    this.time += dt;
    if (car.crashed || Math.abs(car.vx) < 1.2) return;
    for (let i = 0; i < car.wheelWorld.length; i++) {
      const wheel = car.wheelWorld[i]!;
      if (!car.contact[i] || Math.abs(wheel.x - (this.lastX[i] ?? -Infinity)) < 0.24) continue;
      this.lastX[i] = wheel.x;
      const mark = { x: wheel.x, y: heightAt(wheel.x), angle: Math.atan(slopeAt(wheel.x)), born: this.time };
      if (this.marks.length < MAX_MARKS) this.marks.push(mark);
      else {
        this.marks[this.cursor] = mark;
        this.cursor = (this.cursor + 1) % MAX_MARKS;
      }
    }
  }

  draw(rc: RenderContext): void {
    const { ctx, width: W, height: H, view, palette: p } = rc;
    ctx.save();
    ctx.strokeStyle = mixHex("#162e29", "#517e8d", p.detailMix.snow);
    ctx.lineWidth = Math.max(1, view.scale * 0.035);
    for (const mark of this.marks) {
      const x = W * 0.5 + (mark.x - view.x) * view.scale;
      const y = H * 0.5 + (mark.y - view.y) * view.scale + 2;
      const fade = clamp(1 - (this.time - mark.born) / 28, 0, 1);
      if (!fade || x < -20 || x > W + 20 || y > H + 20) continue;
      ctx.globalAlpha = fade * 0.28;
      const dx = Math.cos(mark.angle) * view.scale * 0.08;
      const dy = Math.sin(mark.angle) * view.scale * 0.08;
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    }
    ctx.restore();
  }
}
