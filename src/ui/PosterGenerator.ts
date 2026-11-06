import { STAGE_LENGTH, START_X, VEHICLES } from "../constants";
import { seedHex } from "../daily";
import { biomePaletteAt, stageInfoAt } from "../physics/biomes";
import { heightAt, slopeAt } from "../physics/terrain";
import { VehicleRenderer } from "../render/VehicleRenderer";
import type { BiomePalette, RunMode, StageInfo, VehicleId } from "../types";
import { clamp, hash, roundRect, TAU, withAlpha } from "../utils";
import { byId } from "./dom";

const POSTER_WIDTH = 1200;
const POSTER_HEIGHT = 630;
const PAPER = "#f4e8d2";
const AMBER = "#f0b15e";
const SIGNAL = "#eb633a";
const ICE = "#89d8c8";

const DISPLAY = '"Barlow Condensed","Arial Narrow",sans-serif';
const MONO = '"IBM Plex Mono","SFMono-Regular",monospace';
const SANS = '"Noto Sans SC","PingFang SC",sans-serif';

export interface PosterData {
  vehicleId: VehicleId;
  distance: number;
  mode: RunMode;
  modeLabel: string;
  seed: number;
  dateKey: string;
  record: boolean;
  dailyRecord: boolean;
  challengeWin: boolean;
  runCoins: number;
  flips: number;
  bestCombo: number;
  bounty: number;
  stageCount: number;
  challengeCode: string;
  generatedLabel: string;
}

function digestCode(code: string): string {
  if (!code) return "NO CODE";
  return code.length <= 20 ? code : `${code.slice(0, 12)}…${code.slice(-4)}`;
}

/**
 * Renders the Alpine Dusk tactical report card at a fixed 1200 × 630. The
 * canvas is the same element shown in the preview dialog, so downloading
 * simply serialises what the player already sees.
 */
export class PosterGenerator {
  private readonly canvas = byId<HTMLCanvasElement>("posterCanvas");
  private readonly renderer = new VehicleRenderer();
  private currentCode = "";

  get code(): string {
    return this.currentCode;
  }

  async render(data: PosterData): Promise<void> {
    try {
      await document.fonts.ready;
    } catch (_) {
      /* fall back to the CSS font stack */
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    if (
      this.canvas.width !== POSTER_WIDTH ||
      this.canvas.height !== POSTER_HEIGHT
    ) {
      this.canvas.width = POSTER_WIDTH;
      this.canvas.height = POSTER_HEIGHT;
    }
    this.draw(ctx, data);
    this.currentCode = data.challengeCode;
  }

  download(distance: number): void {
    const link = document.createElement("a");
    link.href = this.canvas.toDataURL("image/png");
    link.download = `ridge-run-${Math.max(0, Math.floor(distance))}m.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* ---------- composition ---------- */

  private draw(ctx: CanvasRenderingContext2D, data: PosterData): void {
    const palette = biomePaletteAt(data.distance);
    const stage = stageInfoAt(data.distance);
    const finalX = START_X + data.distance;
    const groundY = 505;

    ctx.save();
    ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    this.drawSky(ctx, palette);
    this.drawMountains(ctx, palette);
    this.drawForeground(ctx, palette, finalX, groundY);
    this.drawDataScrim(ctx);
    this.drawVehicle(ctx, data, finalX, groundY);
    this.drawHeader(ctx, data);
    this.drawDistance(ctx, data);
    this.drawStats(ctx, data);
    this.drawStages(ctx, data, stage);
    this.drawFooter(ctx, data);
    this.drawFilm(ctx);
    ctx.restore();
  }

  private drawSky(ctx: CanvasRenderingContext2D, p: BiomePalette): void {
    const sky = ctx.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, p.skyTop);
    sky.addColorStop(0.24, p.skyUpper);
    sky.addColorStop(0.48, p.skyMid);
    sky.addColorStop(0.68, p.skyLow);
    sky.addColorStop(0.82, p.skyHorizon);
    sky.addColorStop(1, p.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    // stars
    if (p.starAlpha > 0.12) {
      for (let i = 0; i < 110; i++) {
        const x = hash(i * 3.7 + 11) * POSTER_WIDTH;
        const y = hash(i * 9.1 + 3) * 330;
        const size = 0.7 + hash(i * 1.3) * 1.5;
        ctx.fillStyle = withAlpha(
          PAPER,
          p.starAlpha * (0.22 + hash(i * 5.7) * 0.65),
        );
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
    }

    // aurora ribbons
    if (p.aurora > 0.08) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let band = 0; band < 3; band++) {
        const grad = ctx.createLinearGradient(0, 90, 1100, 350);
        grad.addColorStop(0, withAlpha(ICE, 0));
        grad.addColorStop(0.35, withAlpha(ICE, 0.16 * p.aurora));
        grad.addColorStop(0.7, withAlpha("#9fe8da", 0.1 * p.aurora));
        grad.addColorStop(1, withAlpha(ICE, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 34 - band * 9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-60, 250 + band * 22);
        ctx.bezierCurveTo(
          290,
          55 + band * 34,
          700,
          315 - band * 32,
          1260,
          110 + band * 46,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // sun / moon glow
    const sunX = 928;
    const sunY = 152;
    const sunRadius = 62;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(
      sunX,
      sunY,
      0,
      sunX,
      sunY,
      280,
    );
    glow.addColorStop(0, withAlpha(p.sunGlow, 0.42 * p.sunAlpha));
    glow.addColorStop(0.32, withAlpha(p.sunGlow, 0.14 * p.sunAlpha));
    glow.addColorStop(1, withAlpha(p.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 300, sunY - 300, 600, 600);
    const core = ctx.createRadialGradient(
      sunX - 12,
      sunY - 14,
      2,
      sunX,
      sunY,
      sunRadius,
    );
    core.addColorStop(0, withAlpha(p.sunCore, 0.95 * p.sunAlpha));
    core.addColorStop(0.72, withAlpha(p.sunGlow, 0.85 * p.sunAlpha));
    core.addColorStop(1, withAlpha(p.sunEdge, 0.2 * p.sunAlpha));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, TAU);
    ctx.fill();
    ctx.restore();

    // low haze band
    const haze = ctx.createLinearGradient(0, 300, 0, 470);
    haze.addColorStop(0, withAlpha(p.hazeColor, 0));
    haze.addColorStop(0.55, withAlpha(p.hazeColor, p.hazeAlpha * 0.8));
    haze.addColorStop(1, withAlpha(p.hazeColor, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 300, POSTER_WIDTH, 170);
  }

  private drawMountains(
    ctx: CanvasRenderingContext2D,
    p: BiomePalette,
  ): void {
    this.ridge(ctx, 338, 58, 1.25, 0.8, p.farTop, p.farBottom, p.crestColor);
    this.ridge(ctx, 404, 46, 1.65, 2.4, p.midTop, p.midBottom, p.crestColor);
    this.ridge(ctx, 462, 36, 2.05, 4.1, p.nearTop, p.nearBottom, p.crestColor);
  }

  private ridge(
    ctx: CanvasRenderingContext2D,
    baseY: number,
    amplitude: number,
    frequency: number,
    phase: number,
    top: string,
    bottom: string,
    crest: string,
  ): void {
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(0, POSTER_HEIGHT);
      for (let x = 0; x <= POSTER_WIDTH; x += 8) {
        const t = x / POSTER_WIDTH;
        const y =
          baseY +
          Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude +
          Math.sin(t * Math.PI * 2 * frequency * 2.7 + phase * 1.7) *
            amplitude *
            0.32;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(POSTER_WIDTH, POSTER_HEIGHT);
      ctx.closePath();
    };

    path();
    const grad = ctx.createLinearGradient(0, baseY - amplitude, 0, 540);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x <= POSTER_WIDTH; x += 8) {
      const t = x / POSTER_WIDTH;
      const y =
        baseY +
        Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude +
        Math.sin(t * Math.PI * 2 * frequency * 2.7 + phase * 1.7) *
          amplitude *
          0.32;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(crest, 0.18);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  private drawForeground(
    ctx: CanvasRenderingContext2D,
    p: BiomePalette,
    finalX: number,
    groundY: number,
  ): void {
    const baseHeight = heightAt(finalX);
    const worldAt = (px: number): number => finalX + (px - 790) / 30;
    const screenAt = (px: number): number => {
      const h = heightAt(worldAt(px));
      return groundY - (h - baseHeight) * 14;
    };

    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(0, POSTER_HEIGHT);
      for (let px = 0; px <= POSTER_WIDTH; px += 6) {
        ctx.lineTo(px, screenAt(px));
      }
      ctx.lineTo(POSTER_WIDTH, POSTER_HEIGHT);
      ctx.closePath();
    };

    path();
    const ground = ctx.createLinearGradient(0, groundY - 90, 0, POSTER_HEIGHT);
    ground.addColorStop(0, p.groundTop);
    ground.addColorStop(0.32, p.groundUpper);
    ground.addColorStop(0.72, p.groundMid);
    ground.addColorStop(1, p.groundBottom);
    ctx.fillStyle = ground;
    ctx.fill();

    // strata lines under the crest
    ctx.save();
    for (let layer = 1; layer <= 3; layer++) {
      ctx.beginPath();
      for (let px = 0; px <= POSTER_WIDTH; px += 6) {
        const y = screenAt(px) + layer * (18 + layer * 7);
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.strokeStyle = withAlpha(p.strataColor, 0.16 / layer);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    for (let px = 0; px <= POSTER_WIDTH; px += 6) {
      const y = screenAt(px);
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = withAlpha(p.rimHalo, 0.36);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = p.rim;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(p.rimSoft, 0.5);
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // sparse pines, kept clear of the hero vehicle
    if (p.treeAlpha > 0.02) {
      for (let i = 0; i < 16; i++) {
        const px = 42 + i * 78 + hash(i * 4.3) * 24;
        if (px > 630 && px < 1000) continue;
        const py = screenAt(px);
        const height = 15 + hash(i * 8.7) * 22;
        ctx.fillStyle = withAlpha(p.treeColor, p.treeAlpha * 1.5);
        ctx.beginPath();
        ctx.moveTo(px, py - height);
        ctx.lineTo(px - height * 0.24, py + 2);
        ctx.lineTo(px + height * 0.24, py + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(px - 1, py + 1, 2, 5);
      }
    }
  }

  /** Dark tactical scrim so the data rail stays legible over the ridge. */
  private drawDataScrim(ctx: CanvasRenderingContext2D): void {
    const scrim = ctx.createLinearGradient(0, 0, 790, 0);
    scrim.addColorStop(0, "rgba(3,10,8,.8)");
    scrim.addColorStop(0.55, "rgba(3,10,8,.5)");
    scrim.addColorStop(0.82, "rgba(3,10,8,.13)");
    scrim.addColorStop(1, "rgba(3,10,8,0)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 88, 790, 448);

    ctx.strokeStyle = withAlpha(PAPER, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(44, 88);
    ctx.lineTo(44, 536);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(AMBER, 0.5);
    ctx.beginPath();
    ctx.moveTo(44, 88);
    ctx.lineTo(44, 124);
    ctx.stroke();
  }

  private drawVehicle(
    ctx: CanvasRenderingContext2D,
    data: PosterData,
    finalX: number,
    groundY: number,
  ): void {
    const config = VEHICLES[data.vehicleId];
    const scale = 380 / config.displayLength;
    const x = 790;
    const y = groundY - scale * (config.wheelRadius + config.wheelLocalY) + 3;
    const angle = Math.atan(slopeAt(finalX)) * 0.45 - 0.025;
    const accent = config.accent;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(x, y - 20, 10, x, y - 20, 300);
    halo.addColorStop(0, withAlpha(accent, 0.22));
    halo.addColorStop(0.5, withAlpha(accent, 0.07));
    halo.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y - 10, 330, 190, 0, 0, TAU);
    ctx.fill();

    // speed streaks behind the machine
    for (let i = 0; i < 6; i++) {
      const sy = y - 74 + i * 24;
      const length = 130 + hash(i * 7.7) * 160;
      const streak = ctx.createLinearGradient(470, sy, 720, sy);
      streak.addColorStop(0, withAlpha(accent, 0));
      streak.addColorStop(0.65, withAlpha(accent, 0.1));
      streak.addColorStop(1, withAlpha(accent, 0.24));
      ctx.strokeStyle = streak;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(720 - length, sy);
      ctx.lineTo(720, sy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(2,10,8,.48)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 6, 220, 22, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    this.renderer.drawHero(ctx, config, x, y, scale, angle, 3.35, 2.4);
  }

  private drawHeader(ctx: CanvasRenderingContext2D, data: PosterData): void {
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(44, 36, 5, 34);
    this.text(ctx, "RIDGE RUN", 62, 58, `700 30px ${DISPLAY}`, PAPER);
    this.text(
      ctx,
      "山脊冲刺 · TACTICAL RUN REPORT",
      62,
      78,
      `500 11px ${MONO}, ${SANS}`,
      withAlpha(PAPER, 0.62),
    );

    ctx.textAlign = "right";
    this.text(
      ctx,
      `${data.generatedLabel} · UTC`,
      1156,
      46,
      `500 11px ${MONO}`,
      withAlpha(PAPER, 0.6),
      "right",
    );
    this.text(
      ctx,
      `${data.modeLabel || "STANDARD RUN"} · SEED ${seedHex(data.seed)}`,
      1156,
      68,
      `500 11px ${MONO}, ${SANS}`,
      AMBER,
      "right",
    );
  }

  private drawDistance(ctx: CanvasRenderingContext2D, data: PosterData): void {
    this.text(
      ctx,
      "DISTANCE / 本次行进",
      62,
      128,
      `500 11px ${MONO}, ${SANS}`,
      withAlpha(PAPER, 0.52),
    );

    const value = String(Math.max(0, Math.floor(data.distance)));
    const size =
      value.length >= 6
        ? 108
        : value.length === 5
          ? 136
          : value.length === 4
            ? 164
            : 178;
    ctx.font = `700 ${size}px ${DISPLAY}`;
    const width = ctx.measureText(value).width;
    this.text(ctx, value, 58, 286, `700 ${size}px ${DISPLAY}`, PAPER);
    this.text(
      ctx,
      "m",
      58 + width + 12,
      282,
      `500 34px ${MONO}`,
      withAlpha(PAPER, 0.55),
    );

    const badge = data.challengeWin
      ? "挑战成功 · 击败对手"
      : data.dailyRecord
        ? "今日最佳 · DAILY BEST"
        : data.record
          ? "NEW PERSONAL BEST · 新纪录"
          : data.modeLabel || "STANDARD RUN";
    const accent = data.challengeWin || data.record ? AMBER : ICE;
    ctx.font = `600 12px ${MONO}, ${SANS}`;
    const badgeWidth = Math.min(
      560,
      ctx.measureText(badge).width + 34,
    );
    roundRect(ctx, 62, 306, badgeWidth, 32, 3);
    ctx.fillStyle = withAlpha(accent, 0.12);
    ctx.fill();
    ctx.strokeStyle = withAlpha(accent, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(62, 306, 3, 32);
    this.text(
      ctx,
      badge,
      76,
      327,
      `600 12px ${MONO}, ${SANS}`,
      accent,
    );
  }

  private drawStats(ctx: CanvasRenderingContext2D, data: PosterData): void {
    const stats = [
      ["本程金币", String(data.runCoins), AMBER],
      ["空翻", String(data.flips), ICE],
      ["最高连击", `×${data.bestCombo}`, SIGNAL],
      ["悬赏收益", `+${data.bounty}`, AMBER],
    ] as const;
    ctx.strokeStyle = withAlpha(PAPER, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(62, 356);
    ctx.lineTo(640, 356);
    ctx.stroke();
    stats.forEach(([label, value, color], index) => {
      const x = 62 + index * 148;
      this.text(
        ctx,
        label,
        x,
        380,
        `500 9px ${MONO}, ${SANS}`,
        withAlpha(PAPER, 0.62),
      );
      this.text(ctx, value, x, 414, `600 30px ${DISPLAY}`, color);
    });
  }

  private drawStages(
    ctx: CanvasRenderingContext2D,
    data: PosterData,
    current: StageInfo,
  ): void {
    this.text(
      ctx,
      "赛段足迹 / STAGE ROUTE",
      62,
      448,
      `500 9px ${MONO}, ${SANS}`,
      withAlpha(PAPER, 0.62),
    );
    const reached = clamp(data.stageCount, 0, 4);
    for (let i = 0; i < 4; i++) {
      const info = stageInfoAt(i * STAGE_LENGTH);
      const lit = i < reached;
      const active = i === current.index;
      const x = 62 + i * 116;
      const y = 462;
      roundRect(ctx, x, y, 108, 34, 2);
      ctx.fillStyle = lit
        ? withAlpha(info.accent, 0.14)
        : "rgba(5,15,12,.34)";
      ctx.fill();
      ctx.strokeStyle = active
        ? withAlpha(info.accent, 0.8)
        : withAlpha(PAPER, lit ? 0.22 : 0.1);
      ctx.lineWidth = active ? 1.4 : 1;
      ctx.stroke();
      if (active) {
        ctx.fillStyle = info.accent;
        ctx.fillRect(x, y, 2, 34);
      }
      this.text(
        ctx,
        `0${i + 1}`,
        x + 10,
        y + 14,
        `600 10px ${MONO}`,
        lit ? info.accent : withAlpha(PAPER, 0.3),
      );
      this.text(
        ctx,
        info.name,
        x + 10,
        y + 27,
        `500 10px ${SANS}`,
        lit ? withAlpha(PAPER, 0.82) : withAlpha(PAPER, 0.28),
      );
    }
  }

  private drawFooter(ctx: CanvasRenderingContext2D, data: PosterData): void {
    ctx.fillStyle = "rgba(3,11,8,.9)";
    ctx.fillRect(0, 552, POSTER_WIDTH, 78);
    ctx.strokeStyle = withAlpha(PAPER, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 552.5);
    ctx.lineTo(POSTER_WIDTH, 552.5);
    ctx.stroke();

    this.text(ctx, "RIDGE RUN", 62, 584, `700 24px ${DISPLAY}`, PAPER);
    this.text(
      ctx,
      "山脊冲刺 · ALPINE DUSK",
      62,
      602,
      `500 9px ${MONO}, ${SANS}`,
      withAlpha(PAPER, 0.46),
    );

    this.text(
      ctx,
      `${data.dateKey} · ${data.modeLabel || "STANDARD RUN"} · SEED ${seedHex(data.seed)}`,
      600,
      584,
      `500 10px ${MONO}, ${SANS}`,
      withAlpha(PAPER, 0.66),
      "center",
    );
    this.text(
      ctx,
      "纯前端 · 无后端 · JUST GRAVITY",
      600,
      602,
      `500 8px ${MONO}, ${SANS}`,
      withAlpha(PAPER, 0.32),
      "center",
    );

    this.text(
      ctx,
      digestCode(data.challengeCode),
      1138,
      584,
      `600 10px ${MONO}`,
      AMBER,
      "right",
    );
    this.text(
      ctx,
      "CHALLENGE CODE",
      1138,
      602,
      `500 8px ${MONO}`,
      withAlpha(PAPER, 0.32),
      "right",
    );
  }

  private drawFilm(ctx: CanvasRenderingContext2D): void {
    // vignette
    const vignette = ctx.createRadialGradient(680, 320, 160, 680, 320, 820);
    vignette.addColorStop(0, "rgba(2,8,6,0)");
    vignette.addColorStop(0.72, "rgba(2,8,6,.18)");
    vignette.addColorStop(1, "rgba(2,8,6,.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    // deterministic film grain
    for (let i = 0; i < 1400; i++) {
      const x = hash(i * 2.17 + 7) * POSTER_WIDTH;
      const y = hash(i * 5.71 + 19) * POSTER_HEIGHT;
      const alpha = 0.015 + hash(i * 9.3) * 0.035;
      ctx.fillStyle =
        i % 3 === 0 ? withAlpha(PAPER, alpha) : `rgba(2,8,6,${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // frame + corner brackets
    ctx.strokeStyle = withAlpha(PAPER, 0.2);
    ctx.lineWidth = 1;
    ctx.strokeRect(16.5, 16.5, POSTER_WIDTH - 33, POSTER_HEIGHT - 33);
    ctx.strokeStyle = withAlpha(PAPER, 0.07);
    ctx.strokeRect(24.5, 24.5, POSTER_WIDTH - 49, POSTER_HEIGHT - 49);

    ctx.strokeStyle = withAlpha(AMBER, 0.78);
    ctx.lineWidth = 2;
    const inset = 16;
    const corner = 34;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1],
      [POSTER_WIDTH - inset, inset, -1, 1],
      [inset, POSTER_HEIGHT - inset, 1, -1],
      [POSTER_WIDTH - inset, POSTER_HEIGHT - inset, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * corner, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * corner);
      ctx.stroke();
    }

    // small registration ticks along the left edge
    ctx.strokeStyle = withAlpha(PAPER, 0.18);
    ctx.lineWidth = 1;
    for (let y = 64; y < POSTER_HEIGHT - 48; y += 26) {
      const long = y % 52 === 12;
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(8 + (long ? 8 : 4), y);
      ctx.stroke();
    }
  }

  private text(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: CanvasTextAlign = "left",
  ): void {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }
}
