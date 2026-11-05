import { JUMP_STAGES } from "../constants";
import type { CarState, JumpState, RenderContext } from "../types";
import { TAU } from "../utils";

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
    glow.addColorStop(0, `${stage.color}55`);
    glow.addColorStop(0.48, `${stage.color}20`);
    glow.addColorStop(1, `${stage.color}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.12, radius * 1.2, radius * 0.72, 0, 0, TAU);
    ctx.fill();

    ctx.translate(sx, sy);
    ctx.rotate(car.angle);
    ctx.globalAlpha = 0.42 + tier * 0.12;
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
    const { ctx, view, time } = rc;
    const stage = JUMP_STAGES[jump.calloutTier - 1]!;
    const color = jump.flashColor;
    const duration = jump.calloutReward ? 1.2 : 1.05;
    const progress = 1 - jump.calloutTime / duration;
    const alpha = Math.min(1, jump.calloutTime * 3);
    const x = this.toScreenX(rc, car.x);
    const y =
      this.toScreenY(rc, car.y) - 54 - progress * 24 + Math.sin(time * 9) * 2;
    const title =
      jump.stuntTitle ||
      stage.title + (jump.calloutTier === 3 ? "!!" : "!");
    const subtitle =
      jump.stuntSubtitle ||
      (jump.calloutReward
        ? `+${jump.calloutReward} 金币`
        : `${jump.duration.toFixed(2)}s IN AIR`);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.max(24, Math.min(44, view.scale * 1.45))}px "Noto Sans SC",sans-serif`;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, view.scale * 0.14);
    ctx.strokeStyle = "rgba(7,21,17,.92)";
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 + jump.calloutTier * 7;
    ctx.strokeText(title, x, y);
    ctx.fillStyle = color;
    ctx.fillText(title, x, y);
    ctx.shadowBlur = 0;
    ctx.font = `500 ${Math.max(10, Math.min(15, view.scale * 0.44))}px "IBM Plex Mono",monospace`;
    ctx.fillStyle = "#fff0bd";
    ctx.fillText(subtitle, x, y + Math.max(18, view.scale * 0.7));
    ctx.restore();
  }

  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
