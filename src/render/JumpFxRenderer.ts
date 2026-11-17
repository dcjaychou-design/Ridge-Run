import { JUMP_STAGES } from "../constants";
import type { CarState, GhostKind, JumpState, RenderContext } from "../types";
import { clamp, roundRect, TAU, withAlpha } from "../utils";

/** Screen-space stunt feedback: aura, flash, callout text. */
export class JumpFxRenderer {
  drawAura(rc: RenderContext, car: CarState, jump: JumpState): void {
    if (!jump.airborne || car.crashed) return;
    const { ctx, view, time } = rc;
    const stage = jump.tier ? JUMP_STAGES[jump.tier - 1]! : JUMP_STAGES[0];
    const sx = this.toScreenX(rc, car.x);
    const sy = this.toScreenY(rc, car.y);
    const s = view.scale;
    const pulse = 0.84 + Math.sin(time * 14) * 0.16;
    const tier = Math.max(1, jump.tier);
    const radius = s * (2.15 + tier * 0.38) * pulse;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(sx, sy, s * 0.12, sx, sy, radius);
    glow.addColorStop(0, `${stage.color}28`);
    glow.addColorStop(0.48, `${stage.color}20`);
    glow.addColorStop(1, `${stage.color}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.12, radius * 1.2, radius * 0.72, 0, 0, TAU);
    ctx.fill();

    ctx.translate(sx, sy);
    ctx.rotate(car.angle);
    ctx.globalAlpha = 0.22 + tier * 0.06;
    ctx.strokeStyle = stage.color;
    ctx.lineWidth = Math.max(1, s * 0.035);
    for (let i = 0; i < tier + 1; i++) {
      const orbit = s * (1.35 + i * 0.37);
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        orbit,
        orbit * (0.32 + i * 0.035),
        time * (i % 2 ? -1 : 1) * (0.9 + i * 0.22),
        0.18 + i * 0.68,
        2.48 + i * 0.68,
      );
      ctx.stroke();
    }
    const streakCount = tier * 4 + 2;
    ctx.globalAlpha = 0.18 + tier * 0.1;
    ctx.lineWidth = Math.max(1, s * 0.045);
    for (let i = 0; i < streakCount; i++) {
      const y = (i / Math.max(1, streakCount - 1) - 0.5) * s * 1.35;
      const length = s * (0.52 + ((i * 7) % 5) * 0.18);
      ctx.beginPath();
      ctx.moveTo(-s * 1.45 - length, y + Math.sin(time * 18 + i) * s * 0.08);
      ctx.lineTo(-s * 1.3, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Amber gravity rings while the magnet power-up is live. */
  drawMagnetAura(rc: RenderContext, car: CarState, jump: JumpState): void {
    if (jump.magnetTime <= 0 || car.crashed) return;
    const { ctx, view, time } = rc;
    const sx = this.toScreenX(rc, car.x);
    const sy = this.toScreenY(rc, car.y);
    const s = view.scale;
    const fade = Math.min(1, jump.magnetTime * 1.4);
    const pulse = 0.82 + Math.sin(time * 5.2) * 0.18;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(
      sx,
      sy,
      s * 0.6,
      sx,
      sy,
      s * 6.4 * pulse,
    );
    glow.addColorStop(0, "rgba(240,177,94,0)");
    glow.addColorStop(0.72, `rgba(240,177,94,${0.05 * fade})`);
    glow.addColorStop(1, "rgba(235,99,58,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s * 6.4 * pulse, s * 4.1 * pulse, 0, 0, TAU);
    ctx.fill();

    ctx.translate(sx, sy);
    for (let i = 0; i < 3; i++) {
      const radius = s * (2.5 + i * 0.95) * pulse;
      ctx.strokeStyle = `rgba(240,177,94,${(0.28 - i * 0.06) * fade})`;
      ctx.lineWidth = Math.max(1, s * 0.028);
      ctx.setLineDash([radius * 0.22, radius * 0.3]);
      ctx.lineDashOffset = time * (26 + i * 9) * (i % 2 ? -1 : 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.15, radius * 0.74, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawFlash(rc: RenderContext, car: CarState, jump: JumpState): void {
    const strength = Math.max(jump.flash, jump.landing * 0.5);
    if (strength <= 0) return;
    const { ctx, width: W, height: H } = rc;
    const color = jump.flashColor;
    const sx = this.toScreenX(rc, car.x);
    const sy = this.toScreenY(rc, car.y);
    ctx.save();
    const flash = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.65);
    flash.addColorStop(
      0,
      color +
        Math.round(Math.min(0.16, strength * 0.16) * 255)
          .toString(16)
          .padStart(2, "0"),
    );
    flash.addColorStop(0.36, `${color}10`);
    flash.addColorStop(1, `${color}00`);
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawCallout(rc: RenderContext, car: CarState, jump: JumpState): void {
    if (jump.calloutTime <= 0 || !jump.calloutTier) return;
    const { ctx, view, width: W, height: H } = rc;
    const stage = JUMP_STAGES[jump.calloutTier - 1]!;
    const title = jump.stuntTitle || stage.title;
    const subtitle = jump.stuntSubtitle || (jump.calloutReward
      ? `+${jump.calloutReward} 金币` : `${jump.duration.toFixed(2)}s / AIR TIME`);
    const size = Math.max(16, Math.min(25, view.scale * 0.68));
    ctx.save();
    ctx.globalAlpha = Math.min(1, jump.calloutTime * 4);
    ctx.font = `700 ${size}px "Noto Sans SC",sans-serif`;
    const titleWidth = ctx.measureText(title).width;
    ctx.font = '500 10px "IBM Plex Mono",monospace';
    const boxW = Math.max(120, titleWidth + 34, ctx.measureText(subtitle).width + 34);
    const boxH = size + 34;
    const x = clamp(this.toScreenX(rc, car.x) - boxW / 2, 14, Math.max(14, W - boxW - 14));
    const y = clamp(this.toScreenY(rc, car.y) - boxH - 44, 140, Math.max(140, H - boxH - 110));
    roundRect(ctx, x, y, boxW, boxH, 7);
    ctx.fillStyle = "rgba(8,32,36,.85)"; ctx.fill();
    ctx.strokeStyle = withAlpha(jump.flashColor, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = jump.flashColor; ctx.fillRect(x + 1, y + 11, 2, boxH - 22);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = `700 ${size}px "Noto Sans SC",sans-serif`;
    ctx.fillStyle = "#f6ebd2"; ctx.fillText(title, x + boxW / 2, y + 8);
    ctx.font = '500 10px "IBM Plex Mono",monospace';
    ctx.fillStyle = jump.flashColor; ctx.fillText(subtitle, x + boxW / 2, y + size + 15);
    ctx.restore();
  }

  /**
   * Edge capsule pointing at an off-screen ghost within radar range.
   * `delta` is player distance minus ghost progress, in metres.
   */
  drawGhostRadar(
    rc: RenderContext,
    screenX: number,
    screenY: number,
    delta: number,
    kind: GhostKind,
  ): void {
    const { ctx, width: W, height: H } = rc;
    const outX = screenX < 0 || screenX > W;
    const left = screenX < 0;
    const top = screenY < H * 0.5;
    const color = kind === "pb" ? "#89d8c8" : "#f0b15e";
    const label = kind === "pb" ? "PB" : "RIVAL";
    const text = `${label} ${delta >= 0 ? "+" : ""}${Math.round(delta)}m`;
    const arrow = outX ? (left ? "◀" : "▶") : top ? "▲" : "▼";
    const font = '600 11px "IBM Plex Mono", monospace';
    ctx.save();
    ctx.font = font;
    const textWidth = ctx.measureText(text).width;
    const arrowWidth = ctx.measureText(arrow).width;
    const pad = 9;
    const gap = 6;
    const boxW = textWidth + arrowWidth + gap + pad * 2;
    const boxH = 24;
    const maxY = Math.max(92, H - boxH - 110);
    const x = outX
      ? left
        ? 14
        : Math.max(14, W - boxW - 14)
      : clamp(screenX - boxW * 0.5, 14, Math.max(14, W - boxW - 14));
    const y = outX ? clamp(screenY - boxH * 0.5, 92, maxY) : top ? 92 : maxY;
    roundRect(ctx, x, y, boxW, boxH, 12);
    ctx.fillStyle = "rgba(5,15,12,.8)";
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.52);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = withAlpha(color, 0.55);
    if (outX) {
      ctx.fillRect(x + (left ? 0 : boxW - 2), y + 5, 2, boxH - 10);
    } else {
      ctx.fillRect(x + 6, top ? y : y + boxH - 2, boxW - 12, 2);
    }
    ctx.textBaseline = "middle";
    ctx.fillStyle = delta >= 0 ? color : "#eb633a";
    if (!outX || left) {
      ctx.textAlign = "left";
      ctx.fillText(arrow, x + pad, y + boxH * 0.5 + 0.5);
      ctx.textAlign = "right";
      ctx.fillText(text, x + boxW - pad, y + boxH * 0.5 + 0.5);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(text, x + pad, y + boxH * 0.5 + 0.5);
      ctx.textAlign = "right";
      ctx.fillText(arrow, x + boxW - pad, y + boxH * 0.5 + 0.5);
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
