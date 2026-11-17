import {
  GHOST_ALPHA,
  GHOST_FINISHED_ALPHA,
  START_X,
} from "../constants";
import { ghostProgress } from "../ghost/GhostSystem";
import type { GhostPose } from "../ghost/GhostSystem";
import { heightAt, slopeAt } from "../physics/terrain";
import type {
  CarState,
  GhostKind,
  GhostRecord,
  RenderContext,
  VehicleConfig,
} from "../types";
import { clamp, roundRect, TAU, withAlpha } from "../utils";

export interface GhostScreenPos {
  sx: number;
  sy: number;
  offscreen: boolean;
}

/**
 * Draws the selected machine in the world and the turntable preview in the
 * garage. All three rigs share the same local coordinates as the solver, so
 * wheels always line up with their suspension contact points.
 */
export class VehicleRenderer {
  private spinBuf: number[] = [0, 0, 0];
  private bodySprites = new Map<string, { canvas: HTMLCanvasElement; x: number; y: number; scale: number }>();
  private fontRefreshQueued = false;

  private fillSpins(count: number, spin: number): number[] {
    this.spinBuf.length = count;
    for (let i = 0; i < count; i++) this.spinBuf[i] = spin;
    return this.spinBuf;
  }

  draw(rc: RenderContext, car: CarState, config: VehicleConfig): void {
    const { ctx, width: W, height: H, view, time } = rc;
    const sx = this.toScreenX(rc, car.x);
    const sy = this.toScreenY(rc, car.y);
    const s = view.scale;

    // ground shadow
    const gy = heightAt(car.x);
    const shadowY = this.toScreenY(rc, gy + 0.04);
    ctx.save();
    const clearance = Math.max(0, gy - car.y - config.wheelLocalY - config.wheelRadius);
    ctx.globalAlpha = 0.6 / (1 + clearance * 0.5);
    ctx.translate(sx, shadowY);
    ctx.rotate(Math.atan(slopeAt(car.x)));
    ctx.scale(s * config.displayLength * (0.45 + clearance * 0.025), Math.max(3, s * 0.19));
    const shadow = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1);
    shadow.addColorStop(0, "rgba(4,20,23,.8)");
    shadow.addColorStop(0.45, "rgba(4,20,23,.4)");
    shadow.addColorStop(1, "rgba(4,20,23,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();

    if (sx < -160 || sx > W + 160 || sy < -160 || sy > H + 160) return;

    const night = rc.palette.nightFactor;
    if (night > 0.05 && !car.crashed) {
      this.drawHeadlightPool(rc, car, config, night);
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(car.angle);
    ctx.scale(s, s);
    if (night > 0.05 && !car.crashed) {
      this.drawHeadlightCone(ctx, config, night, time);
    }
    this.drawMachine(ctx, config, car.wheelSpin, time);
    ctx.restore();
  }

  /** Warm pool on the ridge ahead so the beam actually reads as lighting. */
  private drawHeadlightPool(
    rc: RenderContext,
    car: CarState,
    config: VehicleConfig,
    night: number,
  ): void {
    const { ctx } = rc;
    const s = rc.view.scale;
    const ahead = 5.6;
    const c = Math.cos(car.angle);
    const sn = Math.sin(car.angle);
    const wx = car.x + ahead * c - config.headlightPoint.y * sn;
    const gy = heightAt(wx) + 0.05;
    const x = this.toScreenX(rc, wx);
    const y = this.toScreenY(rc, gy);
    const radius = Math.max(30, 3.6 * s);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,228,166,${0.2 * night})`);
    g.addColorStop(0.45, `rgba(255,210,138,${0.08 * night})`);
    g.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius * 1.55,
      radius * 0.42,
      Math.atan(slopeAt(wx)),
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();
  }

  /** Cone-shaped additive beam in vehicle space. */
  private drawHeadlightCone(
    ctx: CanvasRenderingContext2D,
    config: VehicleConfig,
    night: number,
    time: number,
  ): void {
    const hx = config.headlightPoint.x;
    const hy = config.headlightPoint.y;
    const flicker = 0.94 + Math.sin(time * 11.3) * 0.03;
    const length = 9.2 * flicker;
    const half = 0.135;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const beam = ctx.createLinearGradient(hx, hy, hx + length, hy);
    beam.addColorStop(0, `rgba(255,238,199,${0.28 * night})`);
    beam.addColorStop(0.18, `rgba(255,224,166,${0.17 * night})`);
    beam.addColorStop(0.62, `rgba(255,206,138,${0.07 * night})`);
    beam.addColorStop(1, "rgba(255,196,120,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(
      hx + length * 0.42,
      hy - length * half * 0.55,
      hx + length,
      hy - length * half,
    );
    ctx.lineTo(hx + length, hy + length * half);
    ctx.quadraticCurveTo(
      hx + length * 0.42,
      hy + length * half * 0.55,
      hx,
      hy,
    );
    ctx.closePath();
    ctx.fill();

    const core = ctx.createLinearGradient(hx, hy, hx + length * 0.72, hy);
    core.addColorStop(0, `rgba(255,248,226,${0.16 * night})`);
    core.addColorStop(1, "rgba(255,232,180,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + length * 0.72, hy - length * half * 0.38);
    ctx.lineTo(hx + length * 0.72, hy + length * half * 0.38);
    ctx.closePath();
    ctx.fill();

    const flare = ctx.createRadialGradient(hx, hy, 0, hx, hy, 0.55);
    flare.addColorStop(0, `rgba(255,244,210,${0.5 * night})`);
    flare.addColorStop(0.4, `rgba(255,220,160,${0.16 * night})`);
    flare.addColorStop(1, "rgba(255,208,140,0)");
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.55, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Static, gently animated showcase used by the garage modal. */
  drawPreview(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    config: VehicleConfig,
    time: number,
  ): void {
    const scale = Math.min(
      width / (config.displayLength + 1.1),
      height / (config.displayHeight + 0.55),
    );
    const bob = Math.sin(time * 1.7) * 0.025;
    const spin = time * 1.9;

    ctx.save();
    ctx.translate(width / 2, height / 2 + scale * 0.04);

    // accent halo behind the machine
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(0, -scale * 0.05); ctx.scale(scale * 2.7, scale * 1.25);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, withAlpha(config.accent, 0.16));
    glow.addColorStop(0.45, withAlpha(config.accent, 0.07));
    glow.addColorStop(1, withAlpha(config.accent, 0));
    ctx.fillStyle = glow; ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();

    // turntable shadow
    const platformY = scale * (config.wheelRadius + config.wheelLocalY) + scale * 0.06;
    const platformWidth = scale * config.displayLength * 0.5;
    ctx.fillStyle = "#0a2025";
    ctx.beginPath(); ctx.ellipse(0, platformY + scale * 0.055, platformWidth, scale * 0.2, 0, 0, TAU); ctx.fill();
    const platform = ctx.createLinearGradient(0, platformY - scale * 0.14, 0, platformY + scale * 0.15);
    platform.addColorStop(0, "#57706a"); platform.addColorStop(0.4, "#2a4948"); platform.addColorStop(1, "#122e32");
    ctx.fillStyle = platform; ctx.strokeStyle = "rgba(232,214,171,.27)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, platformY, platformWidth, scale * 0.17, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(2,12,9,.5)";
    ctx.beginPath();
    ctx.ellipse(
      0,
      scale * (config.wheelRadius + config.wheelLocalY) + scale * 0.08,
      scale * config.displayLength * 0.4,
      scale * 0.14,
      0,
      0,
      TAU,
    );
    ctx.fill();

    ctx.scale(scale, scale);
    ctx.translate(0, bob);
    ctx.rotate(Math.sin(time * 0.7) * 0.015);
    this.drawMachine(
      ctx,
      config,
      this.fillSpins(config.wheelPositions.length, spin),
      time,
    );
    ctx.restore();
  }

  /**
   * Holographic replay car with a tactical nameplate. Returns the ghost's
   * screen coordinates and offscreen status so the radar takes over cleanly.
   */
  drawGhost(
    rc: RenderContext,
    config: VehicleConfig,
    pose: GhostPose,
    record: GhostRecord,
    kind: GhostKind,
    playerDistance: number,
  ): GhostScreenPos {
    const { ctx, width: W, height: H, view, time } = rc;
    const sx = this.toScreenX(rc, pose.x);
    const sy = this.toScreenY(rc, pose.y);
    const s = view.scale;
    const color = kind === "pb" ? "#89d8c8" : "#f0b15e";
    const alpha = pose.finished
      ? GHOST_FINISHED_ALPHA * (0.86 + Math.sin(time * 2.3) * 0.14)
      : GHOST_ALPHA;
    const cullX = Math.max(160, s * config.displayLength * 0.72 + 40);
    const cullY = Math.max(140, s * config.displayHeight * 1.1 + 40);
    const offscreen =
      sx < -s * config.displayLength * 0.35 ||
      sx > W + s * config.displayLength * 0.35 ||
      sy < -s * config.displayHeight * 0.55 ||
      sy > H + s * config.displayHeight * 0.7;

    if (sx < -cullX || sx > W + cullX || sy < -cullY || sy > H + cullY) {
      return { sx, sy, offscreen: true };
    }

    const groundY = this.toScreenY(rc, heightAt(pose.x) + 0.04);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(
      sx,
      groundY,
      0,
      sx,
      groundY,
      s * config.displayLength * 0.72,
    );
    glow.addColorStop(0, withAlpha(color, 0.18));
    glow.addColorStop(0.55, withAlpha(color, 0.05));
    glow.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(
      sx,
      groundY,
      s * config.displayLength * 0.7,
      s * 0.4,
      Math.atan(slopeAt(pose.x)),
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();

    const spin = (pose.x - START_X) / Math.max(0.18, config.wheelRadius);
    const spins = this.fillSpins(config.wheelPositions.length, spin);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(pose.angle);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    this.drawMachine(ctx, config, spins, time);
    ctx.restore();

    // Hologram wires + scanlines, drawn over the translucent body.
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(pose.angle);
    ctx.scale(s, s);
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = withAlpha(color, 0.72);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 0.026;
    ctx.lineJoin = "round";
    ctx.beginPath();
    const roof = config.roofPoints;
    ctx.moveTo(roof[0]!.x, roof[0]!.y);
    for (let i = 1; i < roof.length; i++) ctx.lineTo(roof[i]!.x, roof[i]!.y);
    ctx.stroke();
    ctx.beginPath();
    const chassis = config.chassisPoints;
    ctx.moveTo(chassis[0]!.x, chassis[0]!.y);
    for (let i = 1; i < chassis.length; i++) {
      ctx.lineTo(chassis[i]!.x, chassis[i]!.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    const frameX = -config.displayLength * 0.56;
    const frameY = -config.displayHeight * 0.86;
    const frameW = config.displayLength * 1.12;
    const frameH = config.displayHeight * 0.98;
    ctx.save();
    roundRect(ctx, frameX, frameY, frameW, frameH, 0.14);
    ctx.clip();
    const gap = 0.13;
    const shift = (time * 1.35) % 1;
    ctx.strokeStyle = withAlpha(color, 0.24);
    ctx.lineWidth = 0.012;
    for (let y = frameY - gap + shift * gap; y < frameY + frameH; y += gap) {
      ctx.beginPath();
      ctx.moveTo(frameX, y);
      ctx.lineTo(frameX + frameW, y);
      ctx.stroke();
    }
    ctx.restore();

    // Four corner brackets keep the scan box reading as instrumentation.
    const corner = Math.min(0.34, frameW * 0.16);
    ctx.strokeStyle = withAlpha(color, 0.2);
    ctx.lineWidth = 0.016;
    const corners = [
      [frameX, frameY, 1, 1],
      [frameX + frameW, frameY, -1, 1],
      [frameX, frameY + frameH, 1, -1],
      [frameX + frameW, frameY + frameH, -1, -1],
    ] as const;
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * corner, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * corner);
      ctx.stroke();
    }
    ctx.restore();

    if (offscreen) return { sx, sy, offscreen: true };

    const progress = ghostProgress(record, pose);
    const delta = Math.round(playerDistance - progress);
    const label = kind === "pb" ? "PB" : "RIVAL";
    const mainText = `${label} · ${record.distance}m`;
    const deltaText = `${delta >= 0 ? "+" : ""}${delta}m`;
    const mainFont = `${Math.max(9, Math.min(13, s * 0.36))}px "IBM Plex Mono", monospace`;
    const deltaFont = `${Math.max(9, Math.min(13, s * 0.36))}px "IBM Plex Mono", monospace`;
    ctx.save();
    ctx.font = mainFont;
    const mainWidth = ctx.measureText(mainText).width;
    ctx.font = deltaFont;
    const deltaWidth = ctx.measureText(deltaText).width;
    const pad = 8;
    const gapWidth = 7;
    const boxHeight = 21;
    const boxWidth = mainWidth + deltaWidth + gapWidth + pad * 2 + 3;
    const boxX = clamp(sx - boxWidth * 0.5, 8, Math.max(8, W - boxWidth - 8));
    const boxY = clamp(
      sy - s * config.displayHeight * 0.95 - 34,
      8,
      Math.max(8, H - boxHeight - 8),
    );
    roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 3);
    ctx.fillStyle = "rgba(5,15,12,.8)";
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(boxX, boxY, 2, boxHeight);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = mainFont;
    ctx.fillStyle = color;
    ctx.fillText(mainText, boxX + pad + 2, boxY + boxHeight * 0.5 + 0.5);
    ctx.font = deltaFont;
    ctx.fillStyle = delta >= 0 ? "#f4e8d2" : "#eb633a";
    ctx.fillText(
      deltaText,
      boxX + pad + mainWidth + gapWidth + 2,
      boxY + boxHeight * 0.5 + 0.5,
    );
    ctx.restore();

    return { sx, sy, offscreen: false };
  }

  /** Glowing ghost finish pennant planted at the replay's final distance. */
  drawGhostMarker(
    rc: RenderContext,
    worldX: number,
    kind: GhostKind,
    distance: number,
  ): void {
    const { ctx, width: W, view, time } = rc;
    const sx = this.toScreenX(rc, worldX);
    if (sx < -140 || sx > W + 140) return;
    const s = view.scale;
    const baseY = this.toScreenY(rc, heightAt(worldX));
    const height = 2.45 * s;
    const color = kind === "pb" ? "#89d8c8" : "#f0b15e";
    const label = kind === "pb" ? "PB" : "RIVAL";
    const pulse = 0.72 + Math.sin(time * 2.4) * 0.2;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const groundGlow = ctx.createRadialGradient(
      sx,
      baseY,
      0,
      sx,
      baseY,
      s * 2.2,
    );
    groundGlow.addColorStop(0, withAlpha(color, 0.18 * pulse));
    groundGlow.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.ellipse(sx, baseY, s * 2.2, s * 0.5, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = withAlpha(color, 0.5 * pulse);
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(sx, baseY);
    ctx.lineTo(sx, baseY - height);
    ctx.stroke();

    ctx.fillStyle = withAlpha(color, 0.26 * pulse);
    ctx.beginPath();
    ctx.moveTo(sx, baseY - height);
    ctx.lineTo(sx + s * 2.15, baseY - height + s * 0.5);
    ctx.lineTo(sx, baseY - height + s * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.46 * pulse);
    ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.max(9, Math.min(13, s * 0.36))}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = withAlpha(color, 0.88);
    ctx.fillText(
      `${label} ${distance}m`,
      sx + s * 0.5,
      baseY - height - Math.max(8, s * 0.3),
    );
    ctx.restore();
  }

  /** Full-bleed hero pose used by the tactical poster. */
  drawHero(
    ctx: CanvasRenderingContext2D,
    config: VehicleConfig,
    x: number,
    y: number,
    scale: number,
    angle: number,
    wheelSpin: number,
    time: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    this.drawMachine(
      ctx,
      config,
      this.fillSpins(config.wheelPositions.length, wheelSpin),
      time,
    );
    ctx.restore();
  }

  private drawMachine(
    ctx: CanvasRenderingContext2D,
    config: VehicleConfig,
    wheelSpin: number[],
    time: number,
  ): void {
    this.drawRunningGear(ctx, config, wheelSpin);
    this.drawBodySprite(ctx, config);
    if (config.id === "moto") this.drawMotoAntenna(ctx, time);
    // Near-side wheels occlude bodywork and expose the brake and alloy faces.
    for (let i = 0; i < config.wheelPositions.length; i++) {
      this.drawTire(ctx, config, config.wheelPositions[i]! + (config.id === "truck" ? 0.06 : 0),
        config.wheelLocalY, config.wheelRadius, wheelSpin[i] ?? 0, false);
    }
  }

  /** Bodywork is rasterised once at high resolution; moving parts draw live.
   * This also keeps local material gradients correct as the chassis rotates. */
  private drawBodySprite(ctx: CanvasRenderingContext2D, config: VehicleConfig): void {
    let sprite = this.bodySprites.get(config.id);
    if (!sprite) {
      const scale = 160;
      const x = -config.displayLength * 0.62;
      const y = -config.displayHeight * 0.8;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(-x * 2 * scale);
      canvas.height = Math.ceil((-y + 0.7) * scale);
      const c = canvas.getContext("2d")!;
      c.scale(scale, scale); c.translate(-x, -y);
      if (config.id === "rally") this.drawRally(c);
      else if (config.id === "moto") this.drawMoto(c);
      else this.drawTruck(c);
      this.drawMetalDetails(c, config);
      sprite = { canvas, x, y, scale };
      this.bodySprites.set(config.id, sprite);
      this.queueFontRefresh();
    }
    ctx.drawImage(sprite.canvas, sprite.x, sprite.y,
      sprite.canvas.width / sprite.scale, sprite.canvas.height / sprite.scale);
  }

  /** Sprites baked before display fonts resolve keep fallback metrics; clear once ready. */
  private queueFontRefresh(): void {
    if (this.fontRefreshQueued) return;
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    if (!fonts) return;
    this.fontRefreshQueued = true;
    fonts.ready.then(() => { this.bodySprites.clear(); }).catch(() => {});
  }

  private drawMetalDetails(ctx: CanvasRenderingContext2D, config: VehicleConfig): void {
    if (config.id === "rally") return;
    ctx.save(); ctx.lineWidth = 0.014;
    ctx.strokeStyle = "rgba(244,249,230,.7)";
    ctx.beginPath();
    if (config.id === "truck") {
      ctx.moveTo(-2.08, -0.91); ctx.lineTo(0.2, -0.91);
      ctx.moveTo(0.4, -0.99); ctx.lineTo(1.18, -0.99);
      ctx.moveTo(-2.08, -0.81); ctx.lineTo(-2.08, 0.07);
      for (let i = 0; i < 7; i++) {
        const x = -2.03 + i * 0.34;
        ctx.moveTo(x, -0.86); ctx.lineTo(x, 0.06);
      }
    } else {
      ctx.moveTo(-0.48, -0.35); ctx.lineTo(-0.09, -0.49); ctx.lineTo(0.35, -0.39);
      ctx.moveTo(0.6, -0.2); ctx.lineTo(0.93, 0.29);
    }
    ctx.stroke();
    if (config.id === "truck") {
      ctx.fillStyle = "rgba(194,226,225,.23)";
      ctx.beginPath(); ctx.moveTo(0.65, -0.87); ctx.lineTo(1.1, -0.87);
      ctx.lineTo(0.9, -0.55); ctx.lineTo(0.65, -0.54); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f6dda6";
      for (let i = 0; i < 4; i++) ctx.fillRect(0.51 + i * 0.19, -1.04, 0.075, 0.035);
      ctx.fillStyle = "#233b3b";
      for (let i = 0; i < 3; i++) ctx.fillRect(-1.96 + i * 0.76, -0.81, 0.34, 0.11);
    }
    if (config.id === "moto") {
      ctx.strokeStyle = "#90aaa3"; ctx.lineWidth = 0.014;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = -0.01 + i * 0.05;
        ctx.moveTo(-0.24, y); ctx.lineTo(0.13, y);
      }
      ctx.moveTo(0.02, -0.58); ctx.lineTo(0.24, -0.78); ctx.stroke();
      ctx.strokeStyle = "#e3af78"; ctx.lineWidth = 0.028;
      ctx.beginPath(); ctx.moveTo(0.12, -0.59); ctx.lineTo(0.31, -0.75); ctx.stroke();
      ctx.fillStyle = "#839f9d"; ctx.beginPath(); ctx.ellipse(0.7, -0.49, 0.055, 0.026, 0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(231,247,234,.72)"; ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.arc(0.38, -0.9, 0.115, Math.PI * 1.12, Math.PI * 1.72); ctx.stroke();
      ctx.fillStyle = "#bfd8d2"; ctx.fillRect(0.43, -0.94, 0.045, 0.014);
    }
    ctx.restore();
  }

  /* ---------- wheels / suspension ---------- */
  private drawRunningGear(
    ctx: CanvasRenderingContext2D,
    config: VehicleConfig,
    wheelSpin: number[],
  ): void {
    const dual = config.id === "truck";

    // suspension arms sit behind the tires
    ctx.save();
    ctx.strokeStyle = "rgba(13,24,19,.92)";
    ctx.lineWidth = 0.075;
    for (let i = 0; i < config.wheelPositions.length; i++) {
      const wx = config.wheelPositions[i]!;
      ctx.beginPath();
      ctx.moveTo(wx * 0.46, 0.1);
      ctx.lineTo(wx, config.wheelLocalY);
      ctx.stroke();
    }
    ctx.restore();

    if (dual) {
      for (let i = 0; i < config.wheelPositions.length; i++) {
        this.drawTire(ctx, config, config.wheelPositions[i]! - 0.11, config.wheelLocalY,
          config.wheelRadius * 0.96, wheelSpin[i] ?? 0, true);
      }
    }
  }

  private drawTire(
    ctx: CanvasRenderingContext2D, config: VehicleConfig,
    x: number, y: number, radius: number, spin: number, inner: boolean,
  ): void {
    ctx.save(); ctx.translate(x, y);
    if (inner) ctx.globalAlpha *= 0.62;
    const rubber = ctx.createRadialGradient(-radius * 0.32, -radius * 0.4, 0, 0, 0, radius);
    rubber.addColorStop(0, "#465254"); rubber.addColorStop(0.58, "#202a2b");
    rubber.addColorStop(0.84, "#0c1517"); rubber.addColorStop(1, "#283332");
    ctx.fillStyle = rubber; ctx.strokeStyle = "#081013"; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.rotate(spin);
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * TAU;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = k % 2 ? "#0a1215" : "#33403d";
      ctx.fillRect(radius * 0.83, -0.032, radius * 0.15, 0.064);
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(209,222,208,.22)"; ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.77, 0, TAU); ctx.stroke();
    const metal = ctx.createLinearGradient(-radius, -radius, radius, radius);
    metal.addColorStop(0, "#f5ecd6"); metal.addColorStop(0.3, "#96b2b2");
    metal.addColorStop(0.5, "#f2e5bc"); metal.addColorStop(0.7, "#536b71"); metal.addColorStop(1, "#b9c9bd");
    ctx.fillStyle = metal;
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.59, 0, TAU); ctx.fill();
    ctx.fillStyle = "#172329";
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.48, 0, TAU); ctx.fill();
    ctx.fillStyle = "#687b78";
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.37, 0, TAU); ctx.fill();
    ctx.fillStyle = "#da6541";
    roundRect(ctx, radius * 0.18, -radius * 0.26, radius * 0.16, radius * 0.42, 0.025); ctx.fill();
    ctx.save(); ctx.rotate(spin);
    ctx.strokeStyle = metal; ctx.lineWidth = config.id === "moto" ? 0.024 : 0.045;
    for (let k = 0; k < (config.id === "moto" ? 10 : 5); k++) {
      const a = k / (config.id === "moto" ? 10 : 5) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * radius * 0.13, Math.sin(a) * radius * 0.13);
      ctx.lineTo(Math.cos(a + 0.18) * radius * 0.51, Math.sin(a + 0.18) * radius * 0.51); ctx.stroke();
    }
    ctx.fillStyle = "#152326";
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.17, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e4d8b8";
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU;
      ctx.beginPath(); ctx.arc(Math.cos(a) * radius * 0.11, Math.sin(a) * radius * 0.11, 0.012, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,237,191,.6)"; ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.95, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    ctx.restore();
  }

  /* ---------- enamel, glass and brushed metal rally body ---------- */
  private drawRally(ctx: CanvasRenderingContext2D): void {
    this.rallySilhouette(ctx);
    const enamel = ctx.createLinearGradient(0, -0.75, 0, 0.34);
    enamel.addColorStop(0, "#fbf5e5"); enamel.addColorStop(0.3, "#dce5dd");
    enamel.addColorStop(0.46, "#fff2d5"); enamel.addColorStop(0.65, "#bdc8b8");
    enamel.addColorStop(0.83, "#81988c"); enamel.addColorStop(1, "#354b47");
    ctx.fillStyle = enamel; ctx.fill(); ctx.lineJoin = "round";
    ctx.strokeStyle = "#182f32"; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.save(); this.rallySilhouette(ctx); ctx.clip();
    const red = ctx.createLinearGradient(0, -0.2, 0, 0.19);
    red.addColorStop(0, "#fb9763"); red.addColorStop(0.4, "#e16c43"); red.addColorStop(1, "#9d3d2f");
    ctx.fillStyle = red; ctx.fillRect(-1.7, -0.16, 3.4, 0.25);
    ctx.fillStyle = "#254b4d";
    ctx.beginPath(); ctx.moveTo(-1.7, -0.17); ctx.lineTo(-1.15, -0.17);
    ctx.lineTo(-0.7, 0.1); ctx.lineTo(-1.02, 0.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,250,217,.8)"; ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.moveTo(-1.5, -0.19); ctx.lineTo(1.48, -0.13); ctx.stroke();
    ctx.fillStyle = "rgba(18,43,40,.33)"; ctx.fillRect(-1.6, 0.21, 3.3, 0.1);
    ctx.restore();

    // Continuous glazed cabin, divided by a proper B pillar.
    const glass = ctx.createLinearGradient(-0.3, -0.65, 0.5, -0.23);
    glass.addColorStop(0, "#b4d2d1"); glass.addColorStop(0.32, "#56858d");
    glass.addColorStop(0.5, "#345d69"); glass.addColorStop(1, "#122b36");
    ctx.beginPath(); ctx.moveTo(-0.47, -0.28); ctx.lineTo(-0.25, -0.58);
    ctx.quadraticCurveTo(-0.2, -0.64, -0.08, -0.64); ctx.lineTo(0.43, -0.61);
    ctx.quadraticCurveTo(0.52, -0.6, 0.58, -0.48); ctx.lineTo(0.76, -0.27); ctx.closePath();
    ctx.fillStyle = glass; ctx.fill(); ctx.strokeStyle = "#233c41"; ctx.lineWidth = 0.034; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = "rgba(231,248,237,.23)";
    ctx.beginPath(); ctx.moveTo(-0.55, -0.65); ctx.lineTo(-0.06, -0.65);
    ctx.lineTo(-0.31, -0.24); ctx.lineTo(-0.76, -0.24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(234,243,218,.28)"; ctx.lineWidth = 0.014;
    ctx.beginPath(); ctx.moveTo(0.15, -0.65); ctx.lineTo(-0.08, -0.25); ctx.stroke();
    // Roll cage and helmet stay subtly visible through the glazing.
    ctx.strokeStyle = "rgba(212,226,208,.4)"; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-0.3, -0.26); ctx.lineTo(0.38, -0.59); ctx.stroke();
    ctx.fillStyle = "#c9b28b"; ctx.beginPath(); ctx.arc(0.22, -0.4, 0.075, 0, TAU); ctx.fill();
    ctx.fillStyle = "#243b40"; ctx.fillRect(0.22, -0.43, 0.075, 0.04);
    ctx.restore();
    ctx.strokeStyle = "#d1dace"; ctx.lineWidth = 0.055;
    ctx.beginPath(); ctx.moveTo(-0.04, -0.64); ctx.lineTo(-0.1, -0.26); ctx.stroke();
    ctx.strokeStyle = "rgba(35,65,62,.55)"; ctx.lineWidth = 0.016;
    ctx.beginPath(); ctx.moveTo(-0.47, -0.22); ctx.lineTo(-0.51, 0.2);
    ctx.lineTo(0.61, 0.2); ctx.lineTo(0.76, -0.22); ctx.stroke();
    ctx.fillStyle = "#284044"; roundRect(ctx, 0.43, -0.18, 0.15, 0.034, 0.015); ctx.fill();
    ctx.fillStyle = "#f1e3be"; roundRect(ctx, -0.36, -0.14, 0.48, 0.3, 0.025); ctx.fill();
    ctx.fillStyle = "#253d3e"; ctx.font = '800 0.27px "Arial Narrow",sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("07", -0.12, 0.018);
    ctx.font = '700 0.068px sans-serif'; ctx.textAlign = "left";
    ctx.fillStyle = "#f6dfb4"; ctx.fillText("RIDGE / WORKS", 0.31, 0.045);
    ctx.fillStyle = "#203b3e"; ctx.fillRect(-1.54, 0.13, 0.23, 0.12); ctx.fillRect(1.32, 0.12, 0.26, 0.12);
    ctx.fillStyle = "#bbc8b6"; ctx.fillRect(1.39, 0.12, 0.18, 0.028);
    ctx.fillStyle = "#b8422d"; ctx.fillRect(-1.53, -0.06, 0.07, 0.12);
    ctx.fillStyle = "#fff7d4"; roundRect(ctx, 1.37, -0.12, 0.15, 0.11, 0.025); ctx.fill();
    ctx.strokeStyle = "#536763"; ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.moveTo(1.43, -0.11); ctx.lineTo(1.43, -0.02); ctx.stroke();
    ctx.fillStyle = "#223f41"; roundRect(ctx, 0.65, -0.28, 0.16, 0.085, 0.025); ctx.fill();
    ctx.fillStyle = "#b9cec6"; ctx.fillRect(0.67, -0.27, 0.11, 0.018);
    // Roof rack, auxiliary rally lamps and warm metal highlights.
    ctx.strokeStyle = "#324b4b"; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(-0.2, -0.72); ctx.lineTo(-0.2, -0.81);
    ctx.lineTo(0.41, -0.81); ctx.lineTo(0.41, -0.7); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "#263e42"; roundRect(ctx, 0.05 + i * 0.12, -0.87, 0.1, 0.08, 0.02); ctx.fill();
      ctx.fillStyle = "#f4e8bb"; ctx.fillRect(0.07 + i * 0.12, -0.855, 0.07, 0.035);
    }
    ctx.strokeStyle = "rgba(255,245,207,.8)"; ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.moveTo(-0.31, -0.66); ctx.lineTo(-0.12, -0.72);
    ctx.lineTo(0.46, -0.69); ctx.moveTo(1.02, -0.21); ctx.lineTo(1.39, -0.16); ctx.stroke();
    ctx.strokeStyle = "#203638"; ctx.lineWidth = 0.017;
    ctx.beginPath(); ctx.moveTo(-1.17, -0.2); ctx.lineTo(-1.29, -0.74); ctx.stroke();
    ctx.fillStyle = "#172a2c"; ctx.fillRect(-1.5, 0.22, 0.1, 0.25); ctx.fillRect(0.86, 0.22, 0.1, 0.25);
  }

  private rallySilhouette(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(-1.52, 0.15);
    ctx.quadraticCurveTo(-1.58, -0.12, -1.4, -0.2);
    ctx.lineTo(-0.66, -0.24);
    ctx.lineTo(-0.3, -0.65);
    ctx.quadraticCurveTo(-0.2, -0.73, 0.02, -0.73);
    ctx.lineTo(0.47, -0.7);
    ctx.quadraticCurveTo(0.62, -0.68, 0.72, -0.53);
    ctx.lineTo(0.98, -0.24);
    ctx.lineTo(1.4, -0.18);
    ctx.quadraticCurveTo(1.57, -0.12, 1.58, 0.08);
    ctx.lineTo(1.48, 0.28);
    ctx.lineTo(0.93, 0.3);
    ctx.lineTo(-1.08, 0.3);
    ctx.closePath();
  }

  /* ---------- moto / ATV ---------- */
  private drawMoto(ctx: CanvasRenderingContext2D): void {
    // rear swingarm + front fork
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2a352d";
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.18);
    ctx.lineTo(-0.94, 0.34);
    ctx.stroke();

    ctx.strokeStyle = "#cbbd9d";
    ctx.lineWidth = 0.085;
    ctx.beginPath();
    ctx.moveTo(0.56, -0.24);
    ctx.lineTo(0.94, 0.34);
    ctx.stroke();
    ctx.strokeStyle = "rgba(20,35,28,.8)";
    ctx.lineWidth = 0.032;
    ctx.beginPath();
    ctx.moveTo(0.63, -0.22);
    ctx.lineTo(1.0, 0.34);
    ctx.stroke();
    ctx.restore();

    // tubular frame
    ctx.save();
    ctx.strokeStyle = "#d8c59f";
    ctx.lineWidth = 0.058;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-0.78, 0.1);
    ctx.lineTo(-0.54, -0.36);
    ctx.lineTo(-0.08, -0.52);
    ctx.lineTo(0.38, -0.42);
    ctx.lineTo(0.64, -0.18);
    ctx.stroke();
    ctx.strokeStyle = "rgba(216,197,159,.65)";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.28);
    ctx.lineTo(-0.3, 0.24);
    ctx.lineTo(0.16, 0.32);
    ctx.lineTo(0.52, 0.08);
    ctx.lineTo(0.58, -0.16);
    ctx.stroke();
    ctx.restore();

    // engine block
    roundRect(ctx, -0.32, -0.06, 0.54, 0.36, 0.07);
    ctx.fillStyle = "#2c4034";
    ctx.fill();
    ctx.strokeStyle = "rgba(10,20,15,.85)";
    ctx.lineWidth = 0.035;
    ctx.stroke();
    ctx.fillStyle = "rgba(240,177,94,.4)";
    ctx.fillRect(-0.24, 0.02, 0.1, 0.05);
    ctx.fillRect(-0.05, 0.02, 0.1, 0.05);

    // seat + tank
    ctx.fillStyle = "#1b2a22";
    ctx.beginPath();
    ctx.moveTo(-0.76, -0.38);
    ctx.quadraticCurveTo(-0.45, -0.49, -0.12, -0.44);
    ctx.lineTo(-0.08, -0.32);
    ctx.quadraticCurveTo(-0.42, -0.34, -0.7, -0.26);
    ctx.closePath();
    ctx.fill();

    const tank = ctx.createLinearGradient(0, -0.62, 0, -0.34);
    tank.addColorStop(0, "#f28a5f");
    tank.addColorStop(1, "#c34127");
    ctx.fillStyle = tank;
    ctx.beginPath();
    ctx.ellipse(0.12, -0.46, 0.26, 0.14, -0.12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,28,21,.85)";
    ctx.lineWidth = 0.035;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,235,206,.45)";
    ctx.beginPath();
    ctx.ellipse(0.08, -0.51, 0.13, 0.04, -0.14, 0, TAU);
    ctx.fill();

    // handlebar
    ctx.strokeStyle = "#202e25";
    ctx.lineWidth = 0.045;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0.58, -0.36);
    ctx.lineTo(0.84, -0.5);
    ctx.stroke();
    ctx.strokeStyle = "#8a7a5a";
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    ctx.moveTo(0.77, -0.48);
    ctx.lineTo(0.9, -0.54);
    ctx.stroke();

    // number board
    ctx.fillStyle = "rgba(9,22,17,.88)";
    roundRect(ctx, -0.7, -0.3, 0.34, 0.23, 0.04);
    ctx.fill();
    ctx.strokeStyle = "rgba(244,232,210,.3)";
    ctx.lineWidth = 0.015;
    ctx.stroke();
    ctx.fillStyle = "#f4e8d2";
    ctx.font = '700 0.22px "Barlow Condensed", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("12", -0.53, -0.183);

    // rider: leg, torso, arm, helmet
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#24362c";
    ctx.lineWidth = 0.13;
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.4);
    ctx.lineTo(-0.26, -0.16);
    ctx.lineTo(-0.2, 0.08);
    ctx.stroke();
    ctx.fillStyle = "#0e1a14";
    ctx.beginPath();
    ctx.ellipse(-0.2, 0.1, 0.13, 0.07, -0.2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#263a2f";
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.36);
    ctx.lineTo(0.08, -0.48);
    ctx.lineTo(0.36, -0.74);
    ctx.lineTo(0.25, -0.87);
    ctx.lineTo(-0.02, -0.62);
    ctx.lineTo(-0.2, -0.46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(9,20,15,.8)";
    ctx.lineWidth = 0.025;
    ctx.stroke();

    ctx.strokeStyle = "#263a2f";
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(0.26, -0.76);
    ctx.lineTo(0.52, -0.62);
    ctx.lineTo(0.73, -0.48);
    ctx.stroke();

    // helmet with sunrise visor
    const helmet = ctx.createLinearGradient(0.3, -1.05, 0.45, -0.78);
    helmet.addColorStop(0, "#ffdf9d"); helmet.addColorStop(0.4, "#eeb475"); helmet.addColorStop(1, "#a46739");
    ctx.fillStyle = helmet;
    ctx.beginPath();
    ctx.arc(0.38, -0.9, 0.135, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,28,21,.85)";
    ctx.lineWidth = 0.028;
    ctx.stroke();
    ctx.fillStyle = "#14261f";
    ctx.beginPath();
    ctx.arc(0.41, -0.89, 0.1, -0.55, 0.9);
    ctx.quadraticCurveTo(0.46, -0.8, 0.3, -0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#eb633a";
    ctx.beginPath();
    ctx.arc(0.38, -0.9, 0.135, -2.2, -1.5);
    ctx.lineTo(0.38, -0.9);
    ctx.fill();

    // headlight
    ctx.fillStyle = "#ffe4a5";
    ctx.beginPath();
    ctx.ellipse(0.78, -0.34, 0.07, 0.05, -0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawMotoAntenna(ctx: CanvasRenderingContext2D, time: number): void {
    // speed shiver on the antenna whip, drawn live so it never freezes in the body sprite
    ctx.save();
    ctx.strokeStyle = "rgba(15,27,21,.75)";
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(-0.64, -0.34);
    ctx.quadraticCurveTo(
      -0.8 + Math.sin(time * 3.1) * 0.03,
      -0.7,
      -0.9,
      -0.86,
    );
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- polar truck ---------- */
  private drawTruck(ctx: CanvasRenderingContext2D): void {
    // chassis rail
    ctx.fillStyle = "#1a2921";
    ctx.strokeStyle = "rgba(8,18,13,.9)";
    ctx.lineWidth = 0.03;
    roundRect(ctx, -2.18, 0.02, 4.05, 0.25, 0.04);
    ctx.fill();
    ctx.stroke();

    // cargo container
    const box = ctx.createLinearGradient(0, -0.98, 0, 0.18);
    box.addColorStop(0, "#6f8a7d");
    box.addColorStop(0.55, "#47645a");
    box.addColorStop(1, "#2a4038");
    ctx.fillStyle = box;
    ctx.strokeStyle = "rgba(9,22,17,.9)";
    ctx.lineWidth = 0.045;
    roundRect(ctx, -2.16, -0.94, 2.42, 1.12, 0.05);
    ctx.fill();
    ctx.stroke();

    // container ribs
    ctx.save();
    ctx.strokeStyle = "rgba(10,26,20,.4)";
    ctx.lineWidth = 0.028;
    for (let i = 0; i < 7; i++) {
      const x = -2.06 + i * 0.34;
      ctx.beginPath();
      ctx.moveTo(x, -0.88);
      ctx.lineTo(x, 0.12);
      ctx.stroke();
    }
    ctx.restore();

    // hazard stripe + polar band
    ctx.fillStyle = "rgba(240,177,94,.8)";
    ctx.fillRect(-2.1, -0.22, 2.3, 0.07);
    ctx.fillStyle = "rgba(235,99,58,.85)";
    ctx.fillRect(-2.1, -0.1, 0.55, 0.1);
    ctx.fillRect(-1.55, -0.1, 0.55, 0.1);
    ctx.fillRect(-1.0, -0.1, 0.55, 0.1);
    ctx.fillRect(-0.45, -0.1, 0.55, 0.1);

    ctx.fillStyle = "rgba(244,232,210,.62)";
    ctx.font = '600 0.2px "Barlow Condensed", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("POLAR HAULER", -2.0, -0.52);
    ctx.fillStyle = "rgba(244,232,210,.3)";
    ctx.font = '500 0.115px "IBM Plex Mono", monospace';
    ctx.fillText("6×6 · ARCTIC SPEC", -2.0, -0.65);

    // cab
    const cab = ctx.createLinearGradient(0, -1.02, 0, 0.22);
    cab.addColorStop(0, "#f0e7d1");
    cab.addColorStop(0.55, "#d7c6a2");
    cab.addColorStop(1, "#ab8e65");
    ctx.beginPath();
    ctx.moveTo(0.34, -1.0);
    ctx.lineTo(1.2, -1.0);
    ctx.quadraticCurveTo(1.32, -1.0, 1.4, -0.9);
    ctx.lineTo(1.68, -0.5);
    ctx.lineTo(1.72, 0.2);
    ctx.lineTo(0.34, 0.22);
    ctx.closePath();
    ctx.fillStyle = cab;
    ctx.fill();
    ctx.strokeStyle = "rgba(10,23,17,.9)";
    ctx.lineWidth = 0.05;
    ctx.lineJoin = "round";
    ctx.stroke();

    // windshield
    ctx.fillStyle = "#173732";
    ctx.strokeStyle = "rgba(12,28,22,.8)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(0.6, -0.9);
    ctx.lineTo(1.12, -0.9);
    ctx.quadraticCurveTo(1.2, -0.88, 1.24, -0.79);
    ctx.lineTo(1.38, -0.53);
    ctx.lineTo(0.6, -0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(244,232,210,.16)";
    ctx.beginPath();
    ctx.moveTo(0.68, -0.85);
    ctx.lineTo(1.02, -0.85);
    ctx.lineTo(0.82, -0.55);
    ctx.lineTo(0.66, -0.55);
    ctx.closePath();
    ctx.fill();

    // side window
    ctx.fillStyle = "#173732";
    ctx.beginPath();
    ctx.moveTo(0.43, -0.88);
    ctx.lineTo(0.53, -0.88);
    ctx.lineTo(0.53, -0.54);
    ctx.lineTo(0.43, -0.54);
    ctx.closePath();
    ctx.fill();

    // door seam + handle + number
    ctx.strokeStyle = "rgba(20,36,28,.55)";
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(0.4, -0.5);
    ctx.lineTo(0.4, 0.2);
    ctx.moveTo(1.44, -0.5);
    ctx.lineTo(1.44, 0.2);
    ctx.stroke();
    ctx.fillStyle = "#263c31";
    ctx.fillRect(1.28, -0.4, 0.11, 0.035);

    // big door number 88
    ctx.fillStyle = "rgba(20,38,29,.85)";
    ctx.font = '700 0.46px "Barlow Condensed", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("88", 0.98, -0.27);
    ctx.fillStyle = "rgba(235,99,58,.9)";
    ctx.fillRect(0.62, -0.15, 0.72, 0.045);

    // grille / bumper / lights
    ctx.fillStyle = "#1c2c23";
    ctx.fillRect(1.53, -0.35, 0.18, 0.44);
    ctx.strokeStyle = "rgba(244,232,210,.22)";
    ctx.lineWidth = 0.018;
    for (let i = 0; i < 4; i++) {
      const y = -0.3 + i * 0.075;
      ctx.beginPath();
      ctx.moveTo(1.55, y);
      ctx.lineTo(1.69, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#24362c";
    roundRect(ctx, 1.55, 0.13, 0.38, 0.16, 0.03);
    ctx.fill();
    ctx.fillStyle = "#ffe4a5";
    ctx.beginPath();
    ctx.ellipse(1.62, -0.05, 0.075, 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,226,160,.28)";
    ctx.beginPath();
    ctx.ellipse(1.62, -0.05, 0.16, 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#bf3c28";
    ctx.fillRect(1.62, 0.16, 0.12, 0.07);
    ctx.fillStyle = "#bf3c28";
    ctx.fillRect(-2.14, 0.04, 0.1, 0.1);

    // exhaust stack behind the cab
    ctx.strokeStyle = "#2a3b31";
    ctx.lineWidth = 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0.2, -0.72);
    ctx.lineTo(0.2, -1.28);
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,232,210,.2)";
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(0.24, -0.74);
    ctx.lineTo(0.24, -1.24);
    ctx.stroke();
    ctx.fillStyle = "#1a2921";
    ctx.beginPath();
    ctx.ellipse(0.2, -1.29, 0.06, 0.028, 0, 0, TAU);
    ctx.fill();

    // fuel tank slung under the chassis
    ctx.fillStyle = "#566f62";
    roundRect(ctx, -0.66, 0.14, 0.56, 0.2, 0.09);
    ctx.fill();
    ctx.strokeStyle = "rgba(10,22,16,.7)";
    ctx.lineWidth = 0.02;
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,232,210,.3)";
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.24);
    ctx.lineTo(-0.16, 0.24);
    ctx.stroke();

    // fender arcs over every axle
    ctx.save();
    ctx.strokeStyle = "rgba(20,38,29,.8)";
    ctx.lineWidth = 0.06;
    for (let i = 0; i < 3; i++) {
      const x = [-1.35, -0.2, 1.35][i]!;
      ctx.beginPath();
      ctx.arc(x, 0.3, 0.64, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();
    }
    ctx.restore();

    // antenna
    ctx.strokeStyle = "rgba(15,27,21,.7)";
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(0.5, -0.98);
    ctx.lineTo(0.38, -1.5);
    ctx.stroke();
  }

  /* ---------- helpers ---------- */
  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
