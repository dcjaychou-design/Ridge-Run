import type { RenderContext } from "../types";
import { hash, TAU, withAlpha } from "../utils";

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
    switch (rc.palette.atmosphere) {
      case "snow":
        this.drawSnow(rc);
        break;
      case "sand":
        this.drawSand(rc);
        break;
      case "night":
        this.drawNightMotes(rc);
        break;
      default:
        this.drawSunMotes(rc);
    }
  }

  private drawSunMotes(rc: RenderContext): void {
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

  /** Glacier: flakes drifting toward the car, with a little side-sway. */
  private drawSnow(rc: RenderContext): void {
    const { ctx, width: W, height: H, time: t } = rc;
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const speed = 24 + (i % 7) * 7;
      const x =
        (hash(i * 4.3) * W -
          t * (12 + (i % 5) * 4) +
          Math.sin(t * 0.7 + i * 1.4) * 18 +
          W * 2) %
        (W + 40);
      const y = (hash(i * 9.1) * H + t * speed) % (H + 30);
      const r = 0.8 + hash(i * 2.3) * 1.9;
      ctx.fillStyle = `rgba(238,252,255,${0.2 + hash(i * 6.5) * 0.42})`;
      ctx.beginPath();
      ctx.ellipse(x - 20, y - 15, r, r * 0.7, 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Canyon: fast horizontal sand streaks. */
  private drawSand(rc: RenderContext): void {
    const { ctx, width: W, height: H, time: t } = rc;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 34; i++) {
      const speed = 90 + (i % 6) * 26;
      const x =
        (((hash(i * 6.7) * W - t * speed) % (W + 120)) + W + 120) %
          (W + 120) -
        60;
      const y = hash(i * 3.9) * H * 0.78 + 20;
      const len = 10 + hash(i * 8.2) * 34;
      const alpha = 0.06 + hash(i * 5.1) * 0.14;
      ctx.strokeStyle = withAlpha(i % 4 === 0 ? "#f0b15e" : "#d98a5a", alpha);
      ctx.lineWidth = 0.7 + hash(i * 4.4) * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y - 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Night summit: faint cold motes drifting up from the ridge. */
  private drawNightMotes(rc: RenderContext): void {
    const { ctx, width: W, height: H, time: t } = rc;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 22; i++) {
      const x =
        ((hash(i * 7.1) * W + Math.sin(t * 0.4 + i) * 16) % (W + 40)) - 20;
      const y =
        H -
        ((hash(i * 4.9) * H * 0.8 + t * (4 + (i % 5) * 2)) % (H * 0.8));
      const a = 0.05 + hash(i * 3.3) * 0.16;
      ctx.fillStyle = withAlpha(i % 3 === 0 ? "#f0b15e" : "#9fe8da", a);
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + hash(i * 8.8) * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGrain(rc: RenderContext): void {
    const { ctx, width: W, height: H, palette } = rc;
    if (palette.nightFactor > 0.01) {
      ctx.save();
      const vignette = ctx.createRadialGradient(
        W * 0.5,
        H * 0.48,
        Math.min(W, H) * 0.24,
        W * 0.5,
        H * 0.52,
        Math.max(W, H) * 0.76,
      );
      vignette.addColorStop(0, "rgba(1,6,12,0)");
      vignette.addColorStop(
        1,
        withAlpha("#010610", 0.16 + palette.nightFactor * 0.2),
      );
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (!this.noisePattern) return;
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = this.noisePattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
