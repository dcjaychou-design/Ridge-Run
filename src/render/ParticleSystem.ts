import type {
  CarState,
  Particle,
  RenderContext,
  VehicleConfig,
} from "../types";
import { clamp, TAU } from "../utils";

const MAX_PARTICLES = 340;
const FLAME_COLORS = ["#eafff7", "#a9f2e4", "#f6c66d"] as const;

/** Dust, exhaust smoke, sparks, landing streaks, shockwaves and coin pops. */
export class ParticleSystem {
  private particles: Particle[] = [];
  private overwriteCursor = 0;
  private nozzleBuf = { x: 0, y: 0, dx: 0, dy: 0 };
  private plumeSprites = new Map<string, HTMLCanvasElement>();

  private plume(color: string): HTMLCanvasElement {
    let sprite = this.plumeSprites.get(color);
    if (sprite) return sprite;
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const c = sprite.getContext("2d")!;
    const g = c.createRadialGradient(27, 24, 2, 32, 32, 31);
    g.addColorStop(0, color);
    g.addColorStop(0.25, color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.plumeSprites.set(color, sprite);
    return sprite;
  }

  clear(): void {
    this.particles.length = 0;
    this.overwriteCursor = 0;
  }

  private add(p: Particle): void {
    if (this.particles.length <= MAX_PARTICLES) {
      this.particles.push(p);
      return;
    }
    this.particles[this.overwriteCursor] = p;
    this.overwriteCursor = (this.overwriteCursor + 1) % this.particles.length;
  }

  spawnDust(x: number, y: number, dir: number, carVx: number): void {
    this.add({
      type: "dust",
      x,
      y,
      vx: dir * (0.4 + Math.random() * 2.1) - carVx * 0.06,
      vy: -0.1 - Math.random() * 0.6,
      life: 0.4 + Math.random() * 0.55,
      maxLife: 0.95,
      size: 0.11 + Math.random() * 0.25,
    });
  }

  /** World-space nozzle anchor and plume direction for the current rig. */
  private nozzle(
    car: CarState,
    config: VehicleConfig,
  ): { x: number; y: number; dx: number; dy: number } {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const lx = config.exhaustPoint.x;
    const ly = config.exhaustPoint.y;
    const out = this.nozzleBuf;
    out.x = car.x + lx * c - ly * s;
    out.y = car.y + lx * s + ly * c;
    out.dx = config.exhaustDir.x * c - config.exhaustDir.y * s;
    out.dy = config.exhaustDir.x * s + config.exhaustDir.y * c;
    return out;
  }

  spawnExhaust(car: CarState, config: VehicleConfig): void {
    const n = this.nozzle(car, config);
    this.add({
      type: "smoke",
      x: n.x + (Math.random() - 0.5) * 0.08,
      y: n.y + (Math.random() - 0.5) * 0.08,
      vx: n.dx * (0.9 + Math.random() * 0.9) - car.vx * 0.08,
      vy: n.dy * (0.9 + Math.random() * 0.9) - 0.2 - Math.random() * 0.2,
      life: 0.5 + Math.random() * 0.55,
      maxLife: 1.05,
      size: 0.07 + Math.random() * 0.13,
    });
  }

  /** Cyan-white-to-amber nitro plume, sprayed at high frequency. */
  spawnNitroFlame(
    car: CarState,
    config: VehicleConfig,
    intensity: number,
  ): void {
    const n = this.nozzle(car, config);
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 0.55;
      const cs = Math.cos(spread);
      const sn = Math.sin(spread);
      const dx = n.dx * cs - n.dy * sn;
      const dy = n.dx * sn + n.dy * cs;
      const speed = 4.5 + Math.random() * 5;
      this.add({
        type: "flame",
        x: n.x + (Math.random() - 0.5) * 0.1,
        y: n.y + (Math.random() - 0.5) * 0.1,
        vx: dx * speed + car.vx * 0.12,
        vy: dy * speed + car.vy * 0.12,
        life: 0.15 + Math.random() * 0.2,
        maxLife: 0.35,
        size: 0.075 + Math.random() * 0.08 + intensity * 0.04,
        color: FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)]!,
      });
    }
  }

  /** Golden friction sparks under the rear tyre during a wheelie. */
  spawnWheelieSpark(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      this.add({
        type: "spark",
        x: x + (Math.random() - 0.5) * 0.16,
        y: y + 0.06,
        vx: -1.4 - Math.random() * 2.4,
        vy: -0.8 - Math.random() * 1.9,
        life: 0.24 + Math.random() * 0.26,
        maxLife: 0.5,
        size: 0.04 + Math.random() * 0.05,
        color: Math.random() < 0.4 ? "#fff0bd" : "#f0b15e",
      });
    }
  }

  spawnMud(x: number, y: number, dir: number, carVx: number): void {
    this.add({
      type: "dust",
      x,
      y,
      vx: dir * (0.6 + Math.random() * 2.2) - carVx * 0.06,
      vy: -0.5 - Math.random() * 1.3,
      life: 0.4 + Math.random() * 0.55,
      maxLife: 0.95,
      size: 0.13 + Math.random() * 0.2,
      color: Math.random() < 0.5 ? "#5d3a24" : "#3c2417",
    });
  }

  spawnSnowSpray(x: number, y: number, dir: number, carVx: number): void {
    this.add({
      type: "dust",
      x,
      y,
      vx: dir * (0.5 + Math.random() * 1.4) - carVx * 0.04,
      vy: -0.8 - Math.random() * 1.6,
      life: 0.28 + Math.random() * 0.32,
      maxLife: 0.6,
      size: 0.05 + Math.random() * 0.09,
      color: "#e6f9fb",
    });
  }

  spawnPickup(x: number, y: number, color?: string): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU;
      const sp = 0.9 + Math.random() * 2.5;
      this.add({
        type: "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.8,
        life: 0.35 + Math.random() * 0.4,
        maxLife: 0.75,
        size: 0.045 + Math.random() * 0.06,
        color: color ?? "#f4c76d",
      });
    }
  }

  spawnShockwave(
    x: number,
    y: number,
    color: string,
    maxRadius: number,
  ): void {
    this.add({
      type: "shockwave",
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.62,
      maxLife: 0.62,
      size: 0,
      radius: maxRadius,
      color,
    });
  }

  spawnJumpBurst(
    x: number,
    y: number,
    tier: number,
    color: string,
  ): void {
    const count = tier === 3 ? 38 : tier === 2 ? 28 : 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + (Math.random() - 0.5) * 0.16;
      const speed =
        (tier === 3 ? 8 : tier === 2 ? 6.5 : 5) * (0.55 + Math.random() * 0.7);
      this.add({
        type: "streak",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1.2,
        life: 0.32 + Math.random() * 0.42,
        maxLife: 0.74,
        size: 0.055 + Math.random() * 0.08,
        length: 0.28 + Math.random() * 0.55,
        color,
      });
    }
  }

  spawnLandingBurst(
    x: number,
    groundY: number,
    tier: number,
    color: string,
  ): void {
    const count = 12 + tier * 8;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.add({
        type: "streak",
        x: x + side * (0.45 + Math.random() * 1.25),
        y: groundY - 0.03,
        vx: side * (1.2 + Math.random() * (2.5 + tier)),
        vy: -0.5 - Math.random() * (1.8 + tier * 0.65),
        life: 0.28 + Math.random() * 0.35,
        maxLife: 0.63,
        size: 0.05 + Math.random() * 0.08,
        length: 0.22 + Math.random() * 0.4,
        color,
      });
    }
    for (let i = 0; i < 3 + tier; i++) {
      this.spawnDust(
        x + (Math.random() - 0.5) * 2.4,
        groundY + 0.04,
        i % 2 ? 1 : -1,
        0,
      );
    }
  }

  spawnCoinReward(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * TAU - Math.PI / 2;
      const speed = 1.1 + Math.random() * 1.1;
      this.add({
        type: "coin",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1.25,
        life: 1 + Math.random() * 0.2,
        maxLife: 1.2,
        size: 0.19,
        phase: Math.random() * TAU,
      });
    }
  }

  update(dt: number): void {
    const particles = this.particles;
    const len = particles.length;
    if (len === 0) return;
    const flameDrag = Math.exp(-1.9 * dt);
    const normalDrag = Math.exp(-0.7 * dt);
    let write = 0;
    for (let i = 0; i < len; i++) {
      const p = particles[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.type !== "shockwave") {
        const gravity =
          p.type === "dust"
            ? 1.4
            : p.type === "smoke"
              ? -0.18
              : p.type === "coin"
                ? 2.1
                : p.type === "flame"
                  ? -0.4
                  : 5.2;
        p.vy += gravity * dt;
        p.vx *= p.type === "flame" ? flameDrag : normalDrag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "coin" && p.phase !== undefined) p.phase += dt * 12;
      }
      particles[write++] = p;
    }
    particles.length = write;
    if (this.overwriteCursor >= write) this.overwriteCursor = 0;
  }

  draw(rc: RenderContext, front: boolean): void {
    const { ctx, width: W, height: H, view } = rc;
    const particles = this.particles;
    const len = particles.length;
    if (len === 0) return;

    const halfW = W * 0.5;
    const halfH = H * 0.5;
    const vx = view.x;
    const vy = view.y;
    const scale = view.scale;

    ctx.save();

    if (!front) {
      // Pass 1: source-over (dust & smoke)
      ctx.globalAlpha = 1;
      for (let i = 0; i < len; i++) {
        const p = particles[i]!;
        if (p.type !== "dust" && p.type !== "smoke") continue;
        const x = halfW + (p.x - vx) * scale;
        const y = halfH + (p.y - vy) * scale;
        if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
        const k = clamp(p.life / p.maxLife, 0, 1);
        const r = Math.max(1, p.size * scale * (1.2 - k * 0.45));
        const color = p.color ?? (p.type === "dust" ? "#d3b589" : "#d6e0d5");
        const size = r * (p.type === "dust" ? 3.4 : 3.8);
        ctx.globalAlpha = k * (p.type === "dust" ? 0.3 : 0.17);
        ctx.drawImage(this.plume(color), x - size * 0.6, y - size * 0.5, size * 1.2, size);
      }

      // Pass 2: lighter (flame & shockwave)
      let lighterSet = false;
      for (let i = 0; i < len; i++) {
        const p = particles[i]!;
        if (p.type !== "flame" && p.type !== "shockwave") continue;
        const x = halfW + (p.x - vx) * scale;
        const y = halfH + (p.y - vy) * scale;
        if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
        if (!lighterSet) {
          ctx.globalCompositeOperation = "lighter";
          lighterSet = true;
        }
        const k = clamp(p.life / p.maxLife, 0, 1);
        if (p.type === "shockwave") {
          const progress = 1 - k;
          ctx.globalAlpha = k * 0.68;
          ctx.strokeStyle = p.color ?? "#f0b15e";
          ctx.lineWidth = 1.2 + k * 2.4;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, (p.radius ?? 4) * progress * scale), 0, TAU);
          ctx.stroke();
        } else {
          const r = Math.max(1, p.size * scale * (1.2 - k * 0.45));
          ctx.globalAlpha = k * 0.85;
          const glowSize = r * 5;
          ctx.drawImage(this.plume(p.color ?? "#a9f2e4"), x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
          ctx.globalAlpha = k * 0.6;
          ctx.fillStyle = "#f4fff9";
          ctx.beginPath();
          ctx.arc(x, y, r * 0.42, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      return;
    }

    // Front layer: spark, streak (lighter) and coin
    let isLighter = false;
    const setLighter = (want: boolean): void => {
      if (isLighter !== want) {
        ctx.globalCompositeOperation = want ? "lighter" : "source-over";
        isLighter = want;
      }
    };

    for (let i = 0; i < len; i++) {
      const p = particles[i]!;
      if (p.type !== "spark" && p.type !== "streak" && p.type !== "coin") {
        continue;
      }
      const x = halfW + (p.x - vx) * scale;
      const y = halfH + (p.y - vy) * scale;
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const k = clamp(p.life / p.maxLife, 0, 1);
      const r = Math.max(1, p.size * scale * (1.2 - k * 0.45));

      if (p.type === "streak") {
        setLighter(true);
        ctx.globalAlpha = k * 0.86;
        ctx.strokeStyle = p.color ?? "#f4c76d";
        ctx.lineWidth = Math.max(1, r * 0.46);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x - p.vx * (p.length ?? 0.3) * scale * 0.12,
          y - p.vy * (p.length ?? 0.3) * scale * 0.12,
        );
        ctx.stroke();
      } else if (p.type === "coin") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(p.phase ?? 0) * 0.18);
        ctx.scale(Math.max(0.14, Math.abs(Math.cos(p.phase ?? 0))), 1);
        const coinR = Math.max(3, p.size * scale);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k;
        ctx.fillStyle = "#f4c76d";
        ctx.beginPath();
        ctx.arc(0, 0, coinR * 1.45, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#f4c76d";
        ctx.strokeStyle = "#fff0bd";
        ctx.lineWidth = Math.max(1, coinR * 0.14);
        ctx.beginPath();
        ctx.arc(0, 0, coinR, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(93,55,18,.72)";
        ctx.font = `700 ${Math.max(6, coinR * 1.1)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", 0, 0.5);
        ctx.restore();
        isLighter = false;
      } else {
        setLighter(true);
        ctx.fillStyle = p.color ?? "#f4c76d";
        ctx.globalAlpha = k * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
