import type { Item, RenderContext } from "../types";
import { roundRect, TAU } from "../utils";

/** Collectible coin ribbons and red fuel cans. */
export class ItemRenderer {
  draw(rc: RenderContext, items: Item[]): void {
    const { width: W, view, time } = rc;
    const left = view.x - W / view.scale / 2 - 10;
    const right = view.x + W / view.scale / 2 + 10;
    for (const item of items) {
      if (!item.alive || item.x < left || item.x > right) continue;
      const bob = Math.sin(time * 2.1 + item.phase) * 0.12;
      const x = this.toScreenX(rc, item.x);
      const y = this.toScreenY(rc, item.y + bob);
      if (item.type === "coin") this.drawCoin(rc, x, y, item.phase);
      else this.drawFuel(rc, x, y, item.phase);
    }
  }

  private drawCoin(
    rc: RenderContext,
    x: number,
    y: number,
    phase: number,
  ): void {
    const { ctx, time, view } = rc;
    const s = view.scale;
    const r = Math.max(9, 0.34 * s);
    const spin = Math.cos(time * 2.75 + phase);
    const wide = 0.18 + Math.abs(spin) * 0.82;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
    halo.addColorStop(0, "rgba(244,194,101,.17)");
    halo.addColorStop(1, "rgba(244,194,101,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.6, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.scale(wide, 1);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, "#ffe2a0");
    g.addColorStop(0.48, "#edb85e");
    g.addColorStop(1, "#a86c26");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(92,52,15,.65)";
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.stroke();
    if (wide > 0.46) {
      ctx.strokeStyle = "rgba(255,239,197,.7)";
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0.3, 2.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFuel(
    rc: RenderContext,
    x: number,
    y: number,
    phase: number,
  ): void {
    const { ctx, time, view } = rc;
    const s = view.scale;
    const w = Math.max(20, 0.62 * s);
    const h = w * 1.22;
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 1.8 + phase) * 2);
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.75);
    halo.addColorStop(0, "rgba(235,99,58,.22)");
    halo.addColorStop(1, "rgba(235,99,58,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, w * 1.75, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // can body
    ctx.fillStyle = "#e05a32";
    ctx.strokeStyle = "rgba(20,20,15,.72)";
    ctx.lineWidth = Math.max(1.2, w * 0.055);
    roundRect(ctx, -w * 0.3, -h * 0.46, w * 0.62, h * 0.82, w * 0.07);
    ctx.fill();
    ctx.stroke();
    // handle
    ctx.strokeStyle = "rgba(32,22,15,.75)";
    ctx.lineWidth = Math.max(1.5, w * 0.075);
    ctx.beginPath();
    ctx.moveTo(-w * 0.13, -h * 0.46);
    ctx.lineTo(-w * 0.13, -h * 0.56);
    ctx.lineTo(w * 0.2, -h * 0.56);
    ctx.lineTo(w * 0.2, -h * 0.46);
    ctx.stroke();
    // spout
    ctx.fillStyle = "#f1d6a9";
    ctx.fillRect(w * 0.23, -h * 0.35, w * 0.16, h * 0.15);
    ctx.fillStyle = "#1c2c22";
    ctx.fillRect(w * 0.25, -h * 0.34, w * 0.08, h * 0.055);
    // label
    ctx.fillStyle = "#f6e5c6";
    ctx.font = `700 ${Math.max(7, w * 0.19)}px "Barlow Condensed",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FUEL", 0, h * 0.07);
    ctx.strokeStyle = "rgba(244,229,196,.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.17, h * 0.22);
    ctx.lineTo(w * 0.17, h * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
