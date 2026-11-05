import type {
  CarState,
  Particle,
  RenderContext,
  VehicleConfig,
} from "../types";
import { clamp, TAU, withAlpha } from "../utils";

const MAX_PARTICLES = 340;

/** Dust, exhaust smoke, sparks, landing streaks, shockwaves and coin pops. */
export class ParticleSystem {
  private particles: Particle[] = [];

  clear(): void {
    this.particles = [];
  }

  private add(p: Particle): void {
    if (this.particles.length > MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
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
    return {
      x: car.x + lx * c - ly * s,
      y: car.y + lx * s + ly * c,
      dx: config.exhaustDir.x * c - config.exhaustDir.y * s,
      dy: config.exhaustDir.x * s + config.exhaustDir.y * c,
    };
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
    const colors = ["#eafff7", "#a9f2e4", "#f6c66d"];
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
        color: colors[Math.floor(Math.random() * colors.length)]!,
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
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
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
        p.vx *= Math.exp(-(p.type === "flame" ? 1.9 : 0.7) * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "coin" && p.phase !== undefined) p.phase += dt * 12;
      }
    }
  }

  draw(rc: RenderContext, front: boolean): void {
    const { ctx, width: W, height: H, view } = rc;
    const toX = (x: number): number => W * 0.5 + (x - view.x) * view.scale;
    const toY = (y: number): number => H * 0.5 + (y - view.y) * view.scale;

    ctx.save();
    for (const p of this.particles) {
      const isFront =
        p.type === "spark" || p.type === "streak" || p.type === "coin";
      if (isFront !== front) continue;
      const x = toX(p.x);
      const y = toY(p.y);
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const k = clamp(p.life / p.maxLife, 0, 1);
      const r = Math.max(1, p.size * view.scale * (1.2 - k * 0.45));

      if (p.type === "shockwave") {
        const progress = 1 - k;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * 0.68;
        ctx.strokeStyle = p.color ?? "#f0b15e";
        ctx.lineWidth = 1.2 + k * 2.4;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, (p.radius ?? 4) * progress * view.scale), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        continue;
      }

      if (p.type === "flame") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = p.color ?? "#a9f2e4";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = k * 0.6;
        ctx.fillStyle = "#f4fff9";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.42, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        continue;
      }

      if (p.type === "dust") {
        ctx.fillStyle = p.color
          ? withAlpha(p.color, k * 0.4)
          : `rgba(220,169,106,${k * 0.23})`;
      } else if (p.type === "smoke") {
        ctx.fillStyle = `rgba(223,216,194,${k * 0.12})`;
      } else if (p.type === "streak") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * 0.86;
        ctx.strokeStyle = p.color ?? "#f4c76d";
        ctx.lineWidth = Math.max(1, r * 0.46);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x - p.vx * (p.length ?? 0.3) * view.scale * 0.12,
          y - p.vy * (p.length ?? 0.3) * view.scale * 0.12,
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        continue;
      } else if (p.type === "coin") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(p.phase ?? 0) * 0.18);
        ctx.scale(Math.max(0.14, Math.abs(Math.cos(p.phase ?? 0))), 1);
        const coinR = Math.max(3, p.size * view.scale);
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
        continue;
      } else {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color ?? "#f4c76d";
        ctx.globalAlpha = k * 0.8;
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (p.type === "spark") {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}
