import type { Item, ItemType, RenderContext } from "../types";
import { roundRect, TAU, withAlpha } from "../utils";

/** Enamel supplies and minted coins. Static artwork is rasterized once;
 * only spinning, glints and beacon pulses are drawn in the live frame. */
export class ItemRenderer {
  private sprites = new Map<ItemType, HTMLCanvasElement>();
  private halos = new Map<string, HTMLCanvasElement>();
  private fontRefreshQueued = false;

  draw(rc: RenderContext, items: Item[]): void {
    const { ctx, width: W, view, time } = rc;
    const left = view.x - W / view.scale / 2 - 10;
    const right = view.x + W / view.scale / 2 + 10;
    for (const item of items) {
      if (!item.alive || item.x < left || item.x > right) continue;
      const bob = Math.sin(time * 2.1 + item.phase) * (item.type === "magnet" ? 0.16 : 0.12);
      const x = W * 0.5 + (item.x - view.x) * view.scale;
      const y = rc.height * 0.5 + (item.y + bob - view.y) * view.scale;
      if (y < -100 || y > rc.height + 100) continue;
      ctx.save(); ctx.translate(x, y);
      if (item.type === "coin") this.drawCoin(rc, item.phase);
      else {
        ctx.translate(0, Math.sin(time * 1.8 + item.phase) * 2);
        if (item.type === "fuel") {
          const w = Math.max(20, 0.62 * view.scale);
          this.halo(ctx, w * 1.75, "#ef8254", 0.2);
          this.artwork(ctx, "fuel", w);
        } else if (item.type === "nitro") {
          const w = Math.max(20, 0.5 * view.scale);
          this.halo(ctx, w * 1.8, "#89d8c8", 0.2 + Math.sin(time * 2.8 + item.phase) * 0.04);
          this.artwork(ctx, "nitro", w);
        } else this.drawMagnet(rc, item.phase);
      }
      ctx.restore();
    }
  }

  private drawCoin(rc: RenderContext, phase: number): void {
    const { ctx, time, view } = rc;
    const r = Math.max(9, 0.34 * view.scale);
    const spin = Math.cos(time * 2.75 + phase);
    const wide = 0.18 + Math.abs(spin) * 0.82;
    this.halo(ctx, r * 2.6, "#f4c265", 0.16);
    // The edge stays visible as the face turns away from the camera.
    ctx.fillStyle = "#a16c32";
    ctx.beginPath(); ctx.ellipse(r * 0.08, 0, r * wide + r * 0.07, r, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.scale(wide, 1);
    this.artwork(ctx, "coin", r * 2);
    const shimmer = Math.sin(time * 1.6 + phase);
    if (shimmer > 0.4) {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, TAU); ctx.clip();
      ctx.fillStyle = withAlpha("#fff7d8", (shimmer - 0.4) * 0.32);
      const offset = (shimmer - 0.7) * r * 4;
      ctx.beginPath(); ctx.moveTo(offset - r * 0.35, -r); ctx.lineTo(offset, -r);
      ctx.lineTo(offset + r * 1.3, r); ctx.lineTo(offset + r * 0.95, r); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const glint = Math.max(0, Math.sin(time * 2.3 + phase * 3) - 0.96) * 25;
    if (glint > 0 && wide > 0.5) {
      ctx.save(); ctx.globalAlpha = glint; ctx.strokeStyle = "#fff5ce"; ctx.lineWidth = 1;
      const x = r * wide * 0.65, y = -r * 0.67, len = r * 0.3;
      ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
      ctx.moveTo(x, y - len); ctx.lineTo(x, y + len); ctx.stroke(); ctx.restore();
    }
  }

  private drawMagnet(rc: RenderContext, phase: number): void {
    const { ctx, time, view } = rc;
    const w = Math.max(22, 0.6 * view.scale);
    this.halo(ctx, w * 1.9, "#f0b15e", 0.21);
    ctx.save(); ctx.rotate(time * 0.7 + phase);
    ctx.strokeStyle = "rgba(240,195,123,.6)"; ctx.lineWidth = Math.max(1, w * 0.032);
    ctx.setLineDash([w * 0.12, w * 0.15]);
    ctx.beginPath(); ctx.arc(0, 0, w * 0.51, 0, TAU); ctx.stroke(); ctx.restore();
    this.artwork(ctx, "magnet", w);
    this.halo(ctx, w * 0.26, "#fff0bd", 0.45 + Math.sin(time * 4.2 + phase) * 0.15);
    ctx.fillStyle = "#fff5d3";
    ctx.beginPath(); ctx.arc(0, 0, Math.max(1.4, w * 0.065), 0, TAU); ctx.fill();
  }

  private halo(ctx: CanvasRenderingContext2D, radius: number, color: string, alpha: number): void {
    let sprite = this.halos.get(color);
    if (!sprite) {
      sprite = document.createElement("canvas"); sprite.width = sprite.height = 128;
      const c = sprite.getContext("2d")!;
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, color); g.addColorStop(0.25, withAlpha(color, 0.55));
      g.addColorStop(0.65, withAlpha(color, 0.14)); g.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      this.halos.set(color, sprite);
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2); ctx.restore();
  }

  private artwork(ctx: CanvasRenderingContext2D, type: ItemType, width: number): void {
    let sprite = this.sprites.get(type);
    if (!sprite) {
      sprite = document.createElement("canvas"); sprite.width = 280; sprite.height = 440;
      const c = sprite.getContext("2d")!;
      c.setTransform(2, 0, 0, 2, 140, 220);
      c.lineJoin = "round"; c.lineCap = "round";
      if (type === "coin") this.mint(c);
      else if (type === "fuel") this.fuelCan(c);
      else if (type === "nitro") this.cylinder(c);
      else this.beacon(c);
      this.sprites.set(type, sprite);
      this.queueFontRefresh();
    }
    ctx.drawImage(sprite, -width * 0.7, -width * 1.1, width * 1.4, width * 2.2);
  }

  /** A sprite baked before the display font finishes loading would keep the
   * fallback lettering for the whole session; rebuild once fonts are ready. */
  private queueFontRefresh(): void {
    if (this.fontRefreshQueued) return;
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    if (!fonts) return;
    this.fontRefreshQueued = true;
    fonts.ready.then(() => { this.sprites.clear(); }).catch(() => {});
  }

  private mint(c: CanvasRenderingContext2D): void {
    const gold = c.createLinearGradient(-38, -45, 38, 45);
    gold.addColorStop(0, "#fff2bd"); gold.addColorStop(0.28, "#f5d08a");
    gold.addColorStop(0.52, "#bd843c"); gold.addColorStop(0.7, "#f5d598"); gold.addColorStop(1, "#ad7232");
    c.fillStyle = gold; c.strokeStyle = "#805629"; c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, 49, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = "#ffedb3"; c.lineWidth = 1.4;
    c.beginPath(); c.arc(-0.5, -0.7, 45, 0, TAU); c.stroke();
    c.strokeStyle = "rgba(110,71,26,.5)"; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, 36, 0, TAU); c.stroke();
    c.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = i * TAU / 32;
      c.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
      c.lineTo(Math.cos(a) * 43, Math.sin(a) * 43);
    }
    c.stroke();
    // An embossed ridge emblem reads on both the world coin and small screens.
    c.strokeStyle = "#fff0bc"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-25, 14); c.lineTo(-5, -17); c.lineTo(7, 1);
    c.lineTo(16, -9); c.lineTo(29, 14); c.stroke();
    c.strokeStyle = "#9b672d"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-25, 16); c.lineTo(-5, -15); c.lineTo(7, 3);
    c.lineTo(16, -7); c.lineTo(29, 16); c.stroke();
    c.fillStyle = "#a16e34"; c.fillRect(-16, 23, 32, 2);
  }

  private fuelCan(c: CanvasRenderingContext2D): void {
    const enamel = c.createLinearGradient(-35, -40, 36, 36);
    enamel.addColorStop(0, "#ffb180"); enamel.addColorStop(0.2, "#f17d50");
    enamel.addColorStop(0.55, "#d35232"); enamel.addColorStop(1, "#8f3629");
    c.fillStyle = enamel; c.strokeStyle = "#532f29"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-30, -52); c.lineTo(16, -52); c.lineTo(34, -35);
    c.lineTo(34, 42); c.quadraticCurveTo(34, 47, 28, 47);
    c.lineTo(-29, 47); c.quadraticCurveTo(-35, 47, -35, 41); c.lineTo(-35, -46); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "rgba(73,36,30,.3)";
    c.beginPath(); c.moveTo(25, -42); c.lineTo(34, -35); c.lineTo(34, 42); c.lineTo(25, 43); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,216,160,.65)"; c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(-30, 37); c.lineTo(-30, -44); c.lineTo(13, -46); c.stroke();
    // Formed metal handle, black opening and a ribbed steel cap.
    c.strokeStyle = "#7a3c2a"; c.lineWidth = 10;
    c.beginPath(); c.moveTo(-21, -53); c.lineTo(-21, -66); c.lineTo(7, -66); c.lineTo(12, -53); c.stroke();
    c.strokeStyle = "#f1aa70"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-23, -57); c.lineTo(-23, -68); c.lineTo(6, -68); c.stroke();
    c.save(); c.translate(25, -42); c.rotate(0.65);
    c.fillStyle = this.metal(c, -10, 10); roundRect(c, -11, -9, 23, 12, 2); c.fill();
    c.strokeStyle = "#686c62"; c.lineWidth = 1;
    for (let x = -7; x < 10; x += 4) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x, 1); c.stroke(); }
    c.restore();
    // Stamped strengthening ribs remain visible around the small cream label.
    c.strokeStyle = "rgba(79,34,26,.35)"; c.lineWidth = 3;
    roundRect(c, -25, -28, 43, 61, 4); c.stroke();
    c.beginPath(); c.moveTo(-20, -24); c.lineTo(13, 28); c.moveTo(13, -24); c.lineTo(-20, 28); c.stroke();
    c.fillStyle = "#efddba"; roundRect(c, -24, -10, 43, 27, 2); c.fill();
    c.fillStyle = "#57382d"; c.font = '700 14px "Barlow Condensed",sans-serif';
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("FUEL", -2, 4);
    c.fillStyle = "rgba(255,225,174,.6)"; c.fillRect(-22, 37, 36, 1.5);
  }

  private cylinder(c: CanvasRenderingContext2D): void {
    c.fillStyle = this.metal(c, -12, 12);
    roundRect(c, -10, -89, 20, 23, 3); c.fill();
    c.fillStyle = "#264844"; roundRect(c, -17, -97, 34, 10, 3); c.fill();
    c.strokeStyle = "#d5e5d6"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, -95); c.lineTo(12, -95); c.stroke();
    const enamel = c.createLinearGradient(-26, 0, 26, 0);
    enamel.addColorStop(0, "#37645e"); enamel.addColorStop(0.12, "#9ed8c9");
    enamel.addColorStop(0.3, "#d4f1dd"); enamel.addColorStop(0.46, "#85c6b6");
    enamel.addColorStop(0.8, "#3e867e"); enamel.addColorStop(1, "#24524f");
    c.fillStyle = enamel; c.strokeStyle = "#1c4544"; c.lineWidth = 2;
    roundRect(c, -26, -72, 52, 143, 18); c.fill(); c.stroke();
    c.strokeStyle = "rgba(232,255,237,.68)"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-18, -52); c.lineTo(-18, 48); c.stroke();
    for (const y of [-48, 45]) {
      c.fillStyle = this.metal(c, -26, 26); c.fillRect(-25, y, 50, 5);
      c.fillStyle = "rgba(8,43,43,.42)"; c.fillRect(-25, y + 5, 50, 2);
    }
    c.fillStyle = "#123a3d"; roundRect(c, -22, -24, 44, 48, 3); c.fill();
    c.fillStyle = "#eef3d7"; c.font = '700 17px "Barlow Condensed",sans-serif';
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("N₂O", 0, -4);
    c.fillStyle = "#87bfae"; c.font = '500 6px "IBM Plex Mono",monospace'; c.fillText("BOOST", 0, 13);
    c.fillStyle = "#dfecda"; c.beginPath(); c.arc(1, -59, 7, 0, TAU); c.fill();
    c.strokeStyle = "#d87d48"; c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(1, -59); c.lineTo(5, -63); c.stroke();
    c.strokeStyle = "rgba(11,53,53,.5)"; c.lineWidth = 1;
    c.beginPath(); c.arc(1, -59, 5, Math.PI, TAU); c.stroke();
  }

  private beacon(c: CanvasRenderingContext2D): void {
    c.strokeStyle = "#283c3a"; c.lineWidth = 19;
    c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.stroke();
    const brass = c.createLinearGradient(-35, -35, 35, 35);
    brass.addColorStop(0, "#fff0be"); brass.addColorStop(0.4, "#e8b777");
    brass.addColorStop(0.6, "#956936"); brass.addColorStop(1, "#e2b479");
    c.strokeStyle = brass; c.lineWidth = 13;
    c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.stroke();
    c.strokeStyle = "#ec8254"; c.lineWidth = 14;
    for (const a of [0, Math.PI]) {
      c.beginPath(); c.arc(0, 0, 30, a - 0.32, a + 0.32); c.stroke();
    }
    c.strokeStyle = "rgba(255,237,185,.75)"; c.lineWidth = 1;
    c.beginPath(); c.arc(-0.5, -0.5, 36, -2.7, -0.5); c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.25 + i * Math.PI * 0.5;
      const x = Math.cos(a) * 30, y = Math.sin(a) * 30;
      c.fillStyle = "#4a5144"; c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill();
      c.fillStyle = "#e6d1a0"; c.fillRect(x - 1, y - 1, 2, 1);
    }
  }

  private metal(c: CanvasRenderingContext2D, left: number, right: number): CanvasGradient {
    const metal = c.createLinearGradient(left, 0, right, 0);
    metal.addColorStop(0, "#6b807c"); metal.addColorStop(0.3, "#e4e9d8");
    metal.addColorStop(0.5, "#a9bab0"); metal.addColorStop(0.74, "#f3efda"); metal.addColorStop(1, "#607875");
    return metal;
  }
}
