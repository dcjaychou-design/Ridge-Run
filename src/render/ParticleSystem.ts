import type { CarState, Particle, RenderContext } from "../types";
import { clamp, TAU } from "../utils";

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

  spawnExhaust(car: CarState): void {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const lx = -1.48;
    const ly = 0.24;
    const x = car.x + lx * c - ly * s;
    const y = car.y + lx * s + ly * c;
    this.add({
      type: "smoke",
      x,
      y,
      vx: -1.1 + Math.random() * 0.6 - car.vx * 0.1,
      vy: -0.35 - Math.random() * 0.3,
      life: 0.5 + Math.random() * 0.55,
      maxLife: 1.05,
      size: 0.07 + Math.random() * 0.13,
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
                : 5.2;
        p.vy += gravity * dt;
        p.vx *= Math.exp(-0.7 * dt);
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

      if (p.type === "dust") {
        ctx.fillStyle = `rgba(220,169,106,${k * 0.23})`;
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
