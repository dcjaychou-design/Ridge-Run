import type { RenderContext } from "../types";
import { hash, TAU } from "../utils";

/** Floating sun motes and a faint generated film grain. */
export class AtmosphereRenderer {
  private noisePattern: CanvasPattern | null = null;

  init(ctx: CanvasRenderingContext2D): void {
    try {
      const n = document.createElement("canvas");
      n.width = 180;
      n.height = 180;
      const nctx = n.getContext("2d");
      if (!nctx) return;
      const data = nctx.createImageData(n.width, n.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const v = Math.random() * 255;
        data.data[i] = v;
        data.data[i + 1] = v;
        data.data[i + 2] = v;
        data.data[i + 3] = 30;
      }
      nctx.putImageData(data, 0, 0);
      this.noisePattern = ctx.createPattern(n, "repeat");
    } catch (_) {
      this.noisePattern = null;
    }
  }

  drawMotes(rc: RenderContext): void {
    const { ctx, width: W, height: H, time: t } = rc;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 16; i++) {
      const x = ((hash(i * 8.3) * W + t * (3 + i * 0.22)) % (W + 60)) - 30;
      const y = hash(i * 5.1) * H * 0.7 + Math.sin(t * 0.3 + i) * 8;
      const a = 0.08 + hash(i * 2.7) * 0.11;
      ctx.fillStyle = `rgba(244,196,123,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + hash(i * 4.2) * 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGrain(rc: RenderContext): void {
    if (!this.noisePattern) return;
    const { ctx, width: W, height: H } = rc;
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = this.noisePattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
