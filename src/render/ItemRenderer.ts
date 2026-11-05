import type { Item, RenderContext } from "../types";
import { roundRect, TAU, withAlpha } from "../utils";

/** Collectible coins, fuel cans, nitro cylinders and magnet beacons. */
export class ItemRenderer {
  draw(rc: RenderContext, items: Item[]): void {
    const { width: W, view, time } = rc;
    const left = view.x - W / view.scale / 2 - 10;
    const right = view.x + W / view.scale / 2 + 10;
    for (const item of items) {
      if (!item.alive || item.x < left || item.x > right) continue;
      const bobScale = item.type === "magnet" ? 0.16 : 0.12;
      const bob = Math.sin(time * 2.1 + item.phase) * bobScale;
      const x = this.toScreenX(rc, item.x);
      const y = this.toScreenY(rc, item.y + bob);
      if (item.type === "coin") this.drawCoin(rc, x, y, item.phase);
      else if (item.type === "fuel") this.drawFuel(rc, x, y, item.phase);
      else if (item.type === "nitro") this.drawNitro(rc, x, y, item.phase);
      else this.drawMagnet(rc, x, y, item.phase);
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

  /** Cyan high-pressure N2O cylinder with a white mark and breathing halo. */
  private drawNitro(
    rc: RenderContext,
    x: number,
    y: number,
    phase: number,
  ): void {
    const { ctx, time, view } = rc;
    const w = Math.max(20, 0.5 * view.scale);
    const h = w * 1.62;
    const breathe = 0.72 + Math.sin(time * 2.8 + phase) * 0.28;
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 1.8 + phase) * 2);

    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.8);
    halo.addColorStop(0, `rgba(137,216,200,${0.16 + breathe * 0.1})`);
    halo.addColorStop(1, "rgba(137,216,200,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, w * 1.8, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // neck + cap
    ctx.fillStyle = "#d8f6ef";
    roundRect(ctx, -w * 0.1, -h * 0.55, w * 0.2, h * 0.13, w * 0.04);
    ctx.fill();
    ctx.fillStyle = "#eafff7";
    roundRect(ctx, -w * 0.15, -h * 0.6, w * 0.3, h * 0.08, w * 0.03);
    ctx.fill();

    // body
    const body = ctx.createLinearGradient(-w * 0.26, 0, w * 0.26, 0);
    body.addColorStop(0, "#d9fff7");
    body.addColorStop(0.28, "#89d8c8");
    body.addColorStop(0.72, "#4f9e94");
    body.addColorStop(1, "#2c6a65");
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(10,31,28,.78)";
    ctx.lineWidth = Math.max(1.2, w * 0.055);
    roundRect(ctx, -w * 0.24, -h * 0.43, w * 0.48, h * 0.86, w * 0.12);
    ctx.fill();
    ctx.stroke();

    // label band + mark
    ctx.fillStyle = "rgba(6,26,23,.7)";
    ctx.fillRect(-w * 0.19, -h * 0.12, w * 0.38, h * 0.27);
    ctx.fillStyle = "#f2fffb";
    ctx.font = `700 ${Math.max(7, w * 0.19)}px "Barlow Condensed",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N2O", 0, h * 0.015);

    // lightning bolt
    ctx.fillStyle = "#fff4c8";
    ctx.beginPath();
    ctx.moveTo(w * 0.01, -h * 0.32);
    ctx.lineTo(w * 0.13, -h * 0.12);
    ctx.lineTo(w * 0.045, -h * 0.12);
    ctx.lineTo(w * 0.11, h * 0.02);
    ctx.lineTo(-w * 0.05, -h * 0.17);
    ctx.lineTo(w * 0.02, -h * 0.17);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Amber / signal-orange ring beacon with a rotating pulse. */
  private drawMagnet(
    rc: RenderContext,
    x: number,
    y: number,
    phase: number,
  ): void {
    const { ctx, time, view } = rc;
    const w = Math.max(22, 0.6 * view.scale);
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 1.6 + phase) * 2);

    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.9);
    halo.addColorStop(0, "rgba(240,177,94,.22)");
    halo.addColorStop(0.55, "rgba(235,99,58,.09)");
    halo.addColorStop(1, "rgba(235,99,58,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, w * 1.9, 0, TAU);
    ctx.fill();

    // rotating dashed pulse ring
    ctx.save();
    ctx.rotate(time * 1.15 + phase);
    ctx.strokeStyle = "rgba(240,177,94,.52)";
    ctx.lineWidth = Math.max(1, w * 0.045);
    ctx.setLineDash([w * 0.14, w * 0.12]);
    ctx.lineDashOffset = -time * w * 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.46, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // ring body
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#f0b15e";
    ctx.lineWidth = Math.max(2.2, w * 0.13);
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.29, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "#eb633a";
    ctx.lineWidth = Math.max(2.2, w * 0.13);
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.29, -0.4, 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.29, Math.PI - 0.35, Math.PI + 0.4);
    ctx.stroke();

    // inner pulse
    const pulse = 0.7 + Math.sin(time * 4.2 + phase) * 0.3;
    ctx.globalCompositeOperation = "lighter";
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.26);
    core.addColorStop(0, withAlpha("#fff0bd", 0.65 * pulse));
    core.addColorStop(1, "rgba(240,177,94,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff0bd";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.4, w * 0.07), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
