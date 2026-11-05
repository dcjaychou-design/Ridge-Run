import { heightAt, slopeAt } from "../physics/terrain";
import type { CarState, RenderContext, VehicleConfig } from "../types";
import { roundRect, TAU } from "../utils";

/**
 * Draws the selected machine in the world and the turntable preview in the
 * garage. All three rigs share the same local coordinates as the solver, so
 * wheels always line up with their suspension contact points.
 */
export class VehicleRenderer {
  draw(rc: RenderContext, car: CarState, config: VehicleConfig): void {
    const { ctx, width: W, height: H, view, time } = rc;
    const sx = this.toScreenX(rc, car.x);
    const sy = this.toScreenY(rc, car.y);
    const s = view.scale;

    // ground shadow
    const gy = heightAt(car.x);
    const shadowY = this.toScreenY(rc, gy + 0.04);
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#02100c";
    ctx.beginPath();
    ctx.ellipse(
      sx,
      shadowY,
      s * config.displayLength * 0.34,
      Math.max(2, s * 0.1),
      Math.atan(slopeAt(car.x)),
      0,
      TAU,
    );
    ctx.fill();
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
    const glow = ctx.createRadialGradient(0, -scale * 0.1, 0, 0, 0, scale * 2.6);
    glow.addColorStop(0, this.withAlpha(config.accent, 0.17));
    glow.addColorStop(1, this.withAlpha(config.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, -scale * 0.05, scale * 2.7, scale * 1.25, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // turntable shadow
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
      config.wheelPositions.map(() => spin),
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
    if (config.id === "rally") this.drawRally(ctx);
    else if (config.id === "moto") this.drawMoto(ctx, time);
    else this.drawTruck(ctx);
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

    for (let i = 0; i < config.wheelPositions.length; i++) {
      const x = config.wheelPositions[i]!;
      const y = config.wheelLocalY;
      const spin = wheelSpin[i] ?? 0;
      if (dual) {
        this.drawTire(ctx, config, x - 0.11, y, config.wheelRadius * 0.96, spin, true);
        this.drawTire(ctx, config, x + 0.06, y, config.wheelRadius, spin, false);
      } else {
        this.drawTire(ctx, config, x, y, config.wheelRadius, spin, false);
      }
    }
  }

  private drawTire(
    ctx: CanvasRenderingContext2D,
    config: VehicleConfig,
    x: number,
    y: number,
    radius: number,
    spin: number,
    inner: boolean,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    if (inner) ctx.globalAlpha = 0.62;

    ctx.fillStyle = inner ? "#080c09" : "#0b100d";
    ctx.strokeStyle = "#2b352c";
    ctx.lineWidth = 0.055;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // tread blocks
    ctx.strokeStyle = "rgba(244,232,210,.16)";
    ctx.lineWidth = 0.04;
    const treads = config.id === "moto" ? 12 : 8;
    for (let k = 0; k < treads; k++) {
      const a = (k / treads) * TAU;
      ctx.beginPath();
      ctx.moveTo(
        Math.cos(a) * (radius - 0.08),
        Math.sin(a) * (radius - 0.08),
      );
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.stroke();
    }

    // rim
    const rimColor =
      config.id === "rally"
        ? "#d8c59f"
        : config.id === "moto"
          ? "#b9c7b2"
          : "#aebbab";
    ctx.fillStyle = rimColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.56, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1b2b22";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.35, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 0.045;
    const spokes = config.id === "truck" ? 6 : 4;
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.1, Math.sin(a) * radius * 0.1);
      ctx.lineTo(
        Math.cos(a) * radius * 0.33,
        Math.sin(a) * radius * 0.33,
      );
      ctx.stroke();
    }

    // hub light catches the sunrise
    ctx.fillStyle = config.id === "truck" ? "#f0b15e" : "#d8c59f";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.11, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- rally ---------- */
  private drawRally(ctx: CanvasRenderingContext2D): void {
    // headlight warm wash
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const head = ctx.createRadialGradient(1.4, -0.04, 0, 1.4, -0.04, 2.2);
    head.addColorStop(0, "rgba(255,220,152,.22)");
    head.addColorStop(1, "rgba(255,220,152,0)");
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(1.4, -0.04, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    this.rallySilhouette(ctx);
    const bodyG = ctx.createLinearGradient(0, -0.72, 0, 0.32);
    bodyG.addColorStop(0, "#f5ead6");
    bodyG.addColorStop(0.5, "#e6d3ae");
    bodyG.addColorStop(1, "#bf9b6d");
    ctx.fillStyle = bodyG;
    ctx.fill();
    ctx.strokeStyle = "rgba(13,25,19,.9)";
    ctx.lineWidth = 0.065;
    ctx.lineJoin = "round";
    ctx.stroke();

    // rally livery
    ctx.save();
    this.rallySilhouette(ctx);
    ctx.clip();
    ctx.fillStyle = "#eb633a";
    ctx.beginPath();
    ctx.moveTo(-1.5, -0.29);
    ctx.lineTo(1.55, -0.2);
    ctx.lineTo(1.55, -0.07);
    ctx.lineTo(-1.5, -0.13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // window / cabin
    ctx.fillStyle = "#173732";
    ctx.strokeStyle = "rgba(14,30,24,.8)";
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.22, -0.57);
    ctx.lineTo(0.3, -0.57);
    ctx.quadraticCurveTo(0.48, -0.53, 0.55, -0.38);
    ctx.lineTo(0.61, -0.27);
    ctx.lineTo(-0.38, -0.27);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // driver
    ctx.fillStyle = "rgba(239,220,188,.7)";
    ctx.beginPath();
    ctx.arc(0.04, -0.43, 0.085, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1c2b22";
    ctx.beginPath();
    ctx.arc(0.04, -0.46, 0.09, Math.PI, TAU);
    ctx.fill();

    // door number
    ctx.fillStyle = "rgba(15,31,24,.8)";
    ctx.font = '600 0.28px "Barlow Condensed", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("07", -0.87, -0.01);

    // lights
    ctx.fillStyle = "#ffe4a5";
    ctx.beginPath();
    ctx.ellipse(1.45, -0.09, 0.1, 0.075, -0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#bf3c28";
    ctx.beginPath();
    ctx.ellipse(-1.49, -0.055, 0.055, 0.09, 0.1, 0, TAU);
    ctx.fill();

    // mud flaps
    ctx.fillStyle = "#111812";
    ctx.fillRect(-1.48, 0.27, 0.13, 0.25);
    ctx.fillRect(0.98, 0.27, 0.13, 0.25);

    // antenna
    ctx.strokeStyle = "rgba(15,27,21,.8)";
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(-1.15, -0.22);
    ctx.quadraticCurveTo(-1.22, -0.65, -1.31, -0.75);
    ctx.stroke();
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
  private drawMoto(ctx: CanvasRenderingContext2D, time: number): void {
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
    ctx.fillStyle = "#f0b15e";
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

    // speed shiver on the antenna whip
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
  private withAlpha(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private toScreenX(rc: RenderContext, x: number): number {
    return rc.width * 0.5 + (x - rc.view.x) * rc.view.scale;
  }

  private toScreenY(rc: RenderContext, y: number): number {
    return rc.height * 0.5 + (y - rc.view.y) * rc.view.scale;
  }
}
