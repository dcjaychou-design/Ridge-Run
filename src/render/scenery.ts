import { hash, mixHex } from "../utils";

/** Smooth deterministic detail anchored to the world, never the viewport. */
export function noise(x: number, seed = 0): number {
  const i = Math.floor(x), t = x - i, k = t * t * (3 - 2 * t);
  return hash(i + seed) * (1 - k) + hash(i + 1 + seed) * k;
}
export function fbm(x: number, seed = 0): number {
  return noise(x, seed) * 0.57 + noise(x * 2.07, seed + 19) * 0.28 +
    noise(x * 4.13, seed + 47) * 0.1 + noise(x * 8.31, seed + 83) * 0.05;
}

/** Branched conifers with a sun-facing edge, shared across forest depths. */
export function pine(
  ctx: CanvasRenderingContext2D, x: number, y: number, h: number,
  color: string, light: string, seed: number, snow = 0,
): void {
  const w = h * (0.16 + hash(seed + 3) * 0.065);
  ctx.fillStyle = color;
  ctx.fillRect(x - h * 0.012, y - h * 0.8, h * 0.024, h * 0.83);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(x, y - h);
    for (let j = 1; j <= 8; j++) {
      const f = j / 8, spread = w * f * (0.8 + hash(seed + j) * 0.4);
      ctx.lineTo(x + side * spread * 0.35, y - h + h * f * 0.78);
      ctx.lineTo(x + side * spread, y - h + h * f * 0.89);
      ctx.lineTo(x + side * spread * 0.5, y - h + h * f * 0.86);
    }
    ctx.lineTo(x, y - h * 0.07);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  for (let j = 1; j <= 8; j++) {
    const f = j / 8;
    ctx.lineTo(x + w * f * 0.34, y - h + h * f * 0.78);
    ctx.lineTo(x + w * f * 0.85, y - h + h * f * 0.88);
    ctx.lineTo(x + w * f * 0.26, y - h + h * f * 0.86);
  }
  ctx.lineTo(x, y - h * 0.1);
  ctx.closePath();
  ctx.fill();
  if (snow > 0.08) {
    ctx.strokeStyle = mixHex(light, "#eaf7f4", snow * 0.8);
    ctx.lineWidth = Math.max(0.6, h * 0.013);
    ctx.beginPath();
    for (let j = 2; j <= 7; j++) {
      const f = j / 8;
      ctx.moveTo(x - w * f * 0.65, y - h + h * f * 0.85);
      ctx.lineTo(x, y - h + h * f * 0.74);
      ctx.lineTo(x + w * f * 0.7, y - h + h * f * 0.86);
    }
    ctx.stroke();
  }
}

export function stone(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  dark: string, light: string, seed: number,
): void {
  const peak = x + r * (hash(seed) - 0.4);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.7, y - r * 0.52);
  ctx.lineTo(peak, y - r * 0.82);
  ctx.lineTo(x + r * 0.8, y - r * 0.48);
  ctx.lineTo(x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(peak, y - r * 0.82);
  ctx.lineTo(x + r * 0.8, y - r * 0.48);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.1, y - r * 0.12);
  ctx.closePath();
  ctx.fill();
}
