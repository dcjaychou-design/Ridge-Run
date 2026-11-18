import { CHUNK, MAGNET_RADIUS, START_X } from "./constants";
import { getWorldSeed, heightAt } from "./physics/terrain";
import type { CarState, Item } from "./types";
import { mulberry32, TAU } from "./utils";

export function pickupRadius(type: Item["type"]): number {
  if (type === "fuel") return 1.95;
  if (type === "coin") return 1.55;
  return 1.9;
}

export function generateChunkItems(chunk: number, items: Item[]): void {
  const rng = mulberry32(
    (((chunk + 7) * 0x9e3779b1) ^ getWorldSeed()) >>> 0,
  );
  const baseX = START_X + chunk * CHUNK;
  let coinStart = Number.POSITIVE_INFINITY;
  let coinEnd = Number.NEGATIVE_INFINITY;
  let fuelX = Number.POSITIVE_INFINITY;
  let magnetX = Number.POSITIVE_INFINITY;

  const isClear = (x: number): boolean => {
    if (Math.abs(x - fuelX) <= 5.5) return false;
    if (Math.abs(x - magnetX) <= 5.5) return false;
    if (x >= coinStart - 5.5 && x <= coinEnd + 4.5) return false;
    return true;
  };

  if (chunk % 2 === 1) {
    const count = 3 + Math.floor(rng() * 3);
    const start = baseX + 10 + rng() * 11;
    coinStart = start;
    coinEnd = start + (count - 1) * 3.15;
    const lift = 1.08 + rng() * 0.5;
    for (let i = 0; i < count; i++) {
      const x = start + i * 3.15;
      const arc = Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 1.55;
      items.push({
        type: "coin",
        x,
        y: heightAt(x) - lift - arc,
        vx: 0,
        vy: 0,
        phase: rng() * TAU,
        alive: true,
      });
    }
  }

  // Fuel spawns on evenly spaced even chunks (2, 6, 10...) so it never lands inside
  // odd-chunk coin arcs and the first pickup arrives once the tank has room for +34.
  if (chunk >= 2 && chunk % 4 === 2) {
    const x = baseX + 13 + rng() * 17;
    fuelX = x;
    items.push({
      type: "fuel",
      x,
      y: heightAt(x) - 1.15,
      vx: 0,
      vy: 0,
      phase: rng() * TAU,
      alive: true,
    });
  }

  // Magnet beacon: placed well ahead of an odd-chunk coin ribbon.
  if (Number.isFinite(coinStart) && rng() < 0.25) {
    const x = Math.max(baseX + 3, coinStart - 7 - rng() * 3);
    if (isClear(x)) {
      magnetX = x;
      items.push({
        type: "magnet",
        x,
        y: heightAt(x) - 1.55,
        vx: 0,
        vy: 0,
        phase: rng() * TAU,
        alive: true,
      });
    }
  }

  // Turbo cylinder: placed in an unoccupied stretch of the chunk.
  if (chunk >= 1 && rng() < 0.35) {
    const u = rng();
    const candidates =
      chunk % 2 === 0
        ? [
            Number.isFinite(fuelX) ? baseX + 3.5 + u * 3.5 : baseX + 6 + u * 24,
            Number.isFinite(fuelX) ? fuelX + 6.5 + u * Math.max(0, baseX + 40 - fuelX - 6.5) : -1,
          ]
        : [
            baseX + 3 + u * 3.5,
            coinEnd + 5 + u * 4,
          ];
    const picked = candidates.find(
      (x) => x >= baseX + 2.5 && x <= baseX + CHUNK - 3 && isClear(x),
    );
    if (picked !== undefined) {
      items.push({
        type: "nitro",
        x: picked,
        y: heightAt(picked) - 1.2,
        vx: 0,
        vy: 0,
        phase: rng() * TAU,
        alive: true,
      });
    }
  }
}

export function ensureChunksAhead(
  carX: number,
  chunkCursor: number,
  items: Item[],
): number {
  let cursor = chunkCursor;
  const target = carX + 310;
  while (START_X + cursor * CHUNK < target) {
    generateChunkItems(cursor, items);
    cursor++;
  }
  if (items.length > 500) {
    let write = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.alive && item.x > carX - 55) {
        items[write++] = item;
      }
    }
    items.length = write;
  }
  return cursor;
}

export function updateWorldItems(
  items: Item[],
  car: Pick<CarState, "x" | "y" | "crashed">,
  magnetActive: boolean,
  dt: number,
  onCollect: (item: Item) => void,
): void {
  let pruned = false;
  const pullK = 1 - Math.exp(-dt * 10);
  const damp = Math.exp(-dt * 1.8);
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!item.alive) {
      pruned = true;
      continue;
    }
    if (item.x < car.x - 60) {
      item.alive = false;
      pruned = true;
      continue;
    }
    if (!car.crashed) {
      if (magnetActive && item.type === "coin") {
        const dx = car.x - item.x;
        const dy = car.y - item.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MAGNET_RADIUS && dist > 0.001) {
          const pull = 30 + (MAGNET_RADIUS - dist) * 8;
          item.vx += ((dx / dist) * pull - item.vx) * pullK;
          item.vy += ((dy / dist) * pull - item.vy) * pullK;
        }
      }
      if (item.vx !== 0 || item.vy !== 0) {
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.vx *= damp;
        item.vy *= damp;
      }
      const dx = item.x - car.x;
      const dy = item.y - car.y;
      const radius = pickupRadius(item.type);
      if (dx * dx + dy * dy < radius * radius) onCollect(item);
    }
  }
  if (pruned && Math.random() < 0.06) {
    let write = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.alive) items[write++] = item;
    }
    items.length = write;
  }
}
