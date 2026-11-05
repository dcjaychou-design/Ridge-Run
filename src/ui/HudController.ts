import { JUMP_STAGES } from "../constants";
import type { FrameFxState, GameState, HudSnapshot } from "../types";
import { clamp, formatCoins } from "../utils";
import { byId } from "./dom";

export class HudController {
  private readonly app = byId("app");
  private readonly hud = byId("hud");
  private readonly frame = byId("impactFrame");
  private readonly distanceValue = byId("distanceValue");
  private readonly bestHud = byId("bestHud");
  private readonly coinValue = byId("coinValue");
  private readonly runCoinDelta = byId("runCoinDelta");
  private readonly fuelPanel = byId("fuelPanel");
  private readonly fuelFill = byId("fuelFill");
  private readonly fuelValue = byId("fuelValue");
  private readonly fuelTrack = byId("fuelTrack");
  private readonly speedo = byId("speedo");
  private readonly speedValue = byId("speedValue");
  private readonly speedFill = byId("speedFill");
  private readonly controls = byId("controls");
  private readonly pauseBtn = byId<HTMLButtonElement>("pauseBtn");
  private readonly muteBtn = byId<HTMLButtonElement>("muteBtn");
  private readonly pauseMuteBtn = byId<HTMLButtonElement>("pauseMuteBtn");
  private readonly toast = byId("toast");
  private readonly toastMain = byId("toastMain");
  private readonly toastDetail = byId("toastDetail");
  private readonly introBest = byId("introBest");
  private readonly homeCoins = byId("homeCoinsValue");

  private toastTimer = 0;
  private last = {
    distance: -1,
    best: -1,
    coins: -1,
    fuel: -1,
    speed: -1,
    delta: "",
    low: false,
  };

  setMode(state: GameState): void {
    const driving = state === "playing";
    const atHome = state === "intro";

    this.hud.classList.toggle("is-hidden", atHome);
    this.controls.classList.toggle("is-hidden", !driving);
    this.speedo.classList.toggle("is-hidden", !driving);
    this.pauseBtn.disabled = !driving;
    this.hud.inert = !driving;
    if (state !== "playing") {
      this.app.classList.remove("is-low-fuel");
    }
  }

  update(snapshot: HudSnapshot, force = false): void {
    const d = Math.floor(snapshot.distance);
    if (force || d !== this.last.distance) {
      this.distanceValue.textContent = String(d);
      this.last.distance = d;
    }
    if (force || snapshot.best !== this.last.best) {
      this.bestHud.textContent = String(snapshot.best);
      this.last.best = snapshot.best;
    }
    if (force || snapshot.coins !== this.last.coins) {
      this.coinValue.textContent = String(snapshot.coins);
      this.last.coins = snapshot.coins;
    }

    if (snapshot.playing && snapshot.runCoins > 0) {
      const delta = `+${snapshot.runCoins}`;
      if (force || this.last.delta !== delta) {
        this.runCoinDelta.textContent = delta;
        this.last.delta = delta;
      }
      this.runCoinDelta.classList.remove("is-hidden");
    } else {
      this.runCoinDelta.classList.add("is-hidden");
      this.last.delta = "";
    }

    const ratio = clamp(snapshot.fuel / Math.max(1, snapshot.fuelCapacity), 0, 1);
    const pct = Math.ceil(ratio * 100);
    if (force || pct !== this.last.fuel) {
      this.fuelValue.textContent = `${pct}%`;
      this.fuelTrack.setAttribute("aria-valuenow", String(pct));
      this.last.fuel = pct;
    }
    this.fuelFill.style.transform = `scaleX(${ratio})`;
    const low = ratio <= 0.2;
    if (force || low !== this.last.low) {
      this.fuelPanel.classList.toggle("is-low", low);
      this.last.low = low;
    }
    this.app.classList.toggle(
      "is-low-fuel",
      low && snapshot.playing && !snapshot.crashed,
    );

    const speed = Math.round(Math.abs(snapshot.speed) * 3.6);
    if (force || speed !== this.last.speed) {
      this.speedValue.textContent = String(speed);
      this.speedFill.style.width = `${clamp(speed / 110, 0, 1) * 100}%`;
      this.last.speed = speed;
    }
  }

  updateMeta(best: number, coins: number): void {
    const hasBest = best > 0;
    this.introBest.textContent = hasBest ? String(best) : "尚无";
    this.introBest.classList.toggle("is-empty", !hasBest);
    this.introBest.parentElement?.classList.toggle("is-empty", !hasBest);
    this.homeCoins.textContent = formatCoins(coins);
  }

  bumpCoins(): void {
    this.coinValue.classList.remove("is-bumped");
    void this.coinValue.offsetWidth;
    this.coinValue.classList.add("is-bumped");
  }

  setMuted(muted: boolean): void {
    const label = muted ? "取消静音" : "静音";
    this.muteBtn.setAttribute("aria-label", label);
    this.muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    this.pauseMuteBtn.textContent = muted ? "声音：关" : "声音：开";
  }

  syncImpactFrame(state: FrameFxState): void {
    const active = state.mode === "air" || state.pulse > 0;
    this.frame.classList.toggle("is-active", active);
    this.frame.classList.toggle("is-airborne", state.mode === "air");
    this.frame.classList.toggle("is-impact", state.mode === "impact");
    this.frame.classList.toggle("is-crashing", state.mode === "crash");
    for (let tier = 1; tier <= JUMP_STAGES.length; tier++) {
      this.frame.classList.toggle(`is-tier-${tier}`, state.tier === tier);
    }
    this.frame.style.setProperty("--frame-color", state.color);
  }

  showToast(main: string, detail?: string): void {
    this.toastMain.textContent = main;
    this.toastDetail.textContent = detail ?? "";
    this.toast.classList.add("is-visible");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove("is-visible");
    }, 2200);
  }

  hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.toast.classList.remove("is-visible");
  }
}
