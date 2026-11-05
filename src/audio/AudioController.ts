/**
 * All game audio is synthesised at runtime. Every scheduled sound is anchored
 * to AudioContext.currentTime — no bare timers — so muting / pausing cannot
 * leave a delayed note hanging in the graph.
 */
export class AudioController {
  muted: boolean;
  private readonly onMutedChange: (muted: boolean) => void;
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;

  constructor(initialMuted: boolean, onMutedChange: (muted: boolean) => void) {
    this.muted = initialMuted;
    this.onMutedChange = onMutedChange;
  }

  get ready(): boolean {
    return this.ac !== null;
  }

  ensure(): void {
    if (this.ac) {
      if (this.ac.state === "suspended") void this.ac.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    try {
      const ac = new Ctor();
      const master = ac.createGain();
      master.gain.value = this.muted ? 0 : 0.7;
      master.connect(ac.destination);

      const engineGain = ac.createGain();
      engineGain.gain.value = 0;
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 280;
      filter.Q.value = 1.2;

      const oscA = ac.createOscillator();
      const oscB = ac.createOscillator();
      oscA.type = "sawtooth";
      oscB.type = "square";
      oscA.frequency.value = 48;
      oscB.frequency.value = 24;
      const subGain = ac.createGain();
      subGain.gain.value = 0.18;
      oscA.connect(filter);
      oscB.connect(subGain);
      subGain.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      oscA.start();
      oscB.start();

      this.ac = ac;
      this.master = master;
      this.engineGain = engineGain;
      this.filter = filter;
      this.oscA = oscA;
      this.oscB = oscB;
      if (ac.state === "suspended") void ac.resume();
    } catch (_) {
      this.ac = null;
    }
  }

  setMuted(next: boolean): void {
    this.muted = next;
    if (this.master && this.ac) {
      const t = this.ac.currentTime;
      this.master.gain.setTargetAtTime(next ? 0 : 0.7, t, 0.03);
    }
    document.body.classList.toggle("is-muted", next);
    this.onMutedChange(next);
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  /** Continuous engine note; called every animation frame. */
  updateEngine(active: boolean, gasHeld: boolean, speed: number): void {
    if (!this.ac || !this.oscA || !this.oscB || !this.filter || !this.engineGain) {
      return;
    }
    const t = this.ac.currentTime;
    if (active) {
      const base = 39 + Math.min(speed * 4.1, 108) + (gasHeld ? 18 : 0);
      this.oscA.frequency.setTargetAtTime(base, t, 0.08);
      this.oscB.frequency.setTargetAtTime(base * 0.5, t, 0.08);
      this.filter.frequency.setTargetAtTime(
        210 + speed * 32 + (gasHeld ? 170 : 0),
        t,
        0.08,
      );
      const target =
        0.012 + (gasHeld ? 0.028 : 0.006) + Math.min(speed * 0.0007, 0.012);
      this.engineGain.gain.setTargetAtTime(target, t, 0.12);
    } else {
      this.engineGain.gain.setTargetAtTime(0.0001, t, 0.12);
    }
  }

  fuelPickup(): void {
    this.chime(392, 0.16, "triangle", 0.05);
    this.chime(587, 0.22, "triangle", 0.045, 0, 0.09);
  }

  coinPickup(runCoins: number): void {
    const note = 620 + ((runCoins % 5) * 75);
    this.chime(note, 0.09, "triangle", 0.026);
  }

  crash(): void {
    this.chime(132, 0.4, "sawtooth", 0.055, 44);
    this.chime(82, 0.55, "triangle", 0.04, 32);
  }

  jump(tier: number): void {
    const note = tier === 3 ? 1320 : tier === 2 ? 920 : 680;
    this.chime(note, 0.17 + tier * 0.035, "triangle", 0.035 + tier * 0.01, note * 1.42);
  }

  takeoff(): void {
    this.chime(480, 0.12, "triangle", 0.035, 720);
  }

  landing(tier: number): void {
    if (tier > 0) this.chime(220 + tier * 90, 0.2, "sine", 0.03, 160);
  }

  upgrade(): void {
    this.chime(523, 0.14, "triangle", 0.04);
    this.chime(659, 0.16, "triangle", 0.038, 0, 0.08);
    this.chime(784, 0.24, "triangle", 0.036, 0, 0.16);
  }

  unlock(): void {
    this.chime(392, 0.18, "square", 0.03);
    this.chime(587, 0.2, "triangle", 0.04, 0, 0.12);
    this.chime(880, 0.3, "triangle", 0.038, 0, 0.24);
  }

  select(): void {
    this.chime(440, 0.08, "triangle", 0.03);
    this.chime(660, 0.12, "triangle", 0.026, 0, 0.06);
  }

  deny(): void {
    this.chime(180, 0.14, "square", 0.03, 120);
  }

  private chime(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    slide = 0,
    delay = 0,
  ): void {
    if (!this.ac || !this.master || this.muted) return;
    const ac = this.ac;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, slide), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }
}
