import { cameraWidthTag } from "../camera";
import {
  DEFAULT_CAMERA_WIDTH,
  JUMP_STAGES,
  MAGNET_DURATION,
  MAX_CAMERA_WIDTH,
  MAX_NITRO_TIME,
  MIN_CAMERA_WIDTH,
} from "../constants";
import type { FrameFxState, GameState, HudSnapshot } from "../types";
import { clamp, formatCoins } from "../utils";
import { byId } from "./dom";

export { cameraWidthTag };

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
  private readonly hudFovValue = byId("hudFovValue");
  private readonly introFovValue = byId("introFovValue");
  private readonly pauseFovValue = byId("pauseFovValue");
  private readonly introFovRange = byId<HTMLInputElement>("introFovRange");
  private readonly pauseFovRange = byId<HTMLInputElement>("pauseFovRange");
  private readonly introFovDecBtn = byId<HTMLButtonElement>("introFovDecBtn");
  private readonly introFovIncBtn = byId<HTMLButtonElement>("introFovIncBtn");
  private readonly introFovResetBtn = byId<HTMLButtonElement>("introFovResetBtn");
  private readonly pauseFovDecBtn = byId<HTMLButtonElement>("pauseFovDecBtn");
  private readonly pauseFovIncBtn = byId<HTMLButtonElement>("pauseFovIncBtn");
  private readonly pauseFovResetBtn = byId<HTMLButtonElement>("pauseFovResetBtn");
  private readonly toast = byId("toast");
  private readonly toastMain = byId("toastMain");
  private readonly toastDetail = byId("toastDetail");
  private readonly introBest = byId("introBest");
  private readonly homeCoins = byId("homeCoinsValue");
  private readonly stageChip = byId("stageChip");
  private readonly modeChip = byId("modeChip");
  private readonly buffBar = byId("buffBar");
  private readonly nitroBuff = byId("nitroBuff");
  private readonly nitroFill = byId("nitroFill");
  private readonly nitroTime = byId("nitroTime");
  private readonly magnetBuff = byId("magnetBuff");
  private readonly magnetFill = byId("magnetFill");
  private readonly magnetTime = byId("magnetTime");
  private readonly comboChip = byId("comboChip");
  private readonly comboValue = byId("comboValue");

  private toastTimer = 0;
  private last = {
    distance: -1,
    best: -1,
    coins: -1,
    fuel: -1,
    fuelFill: -1,
    speed: -1,
    delta: "",
    low: false,
    stage: "",
    nitro: -1,
    magnet: -1,
    nitroFill: -1,
    magnetFill: -1,
    combo: -1,
    fovKey: "",
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
    // The CSS transition supplies smooth movement between sub-pixel changes;
    // writing every solver sample needlessly invalidates the whole HUD.
    const fuelFill = Math.round(ratio * 1000) / 1000;
    if (force || fuelFill !== this.last.fuelFill) {
      this.fuelFill.style.transform = `scaleX(${fuelFill})`;
      this.last.fuelFill = fuelFill;
    }
    const low = ratio <= 0.2;
    if (force || low !== this.last.low) {
      this.fuelPanel.classList.toggle("is-low", low);
      this.last.low = low;
    }
    this.app.classList.toggle(
      "is-low-fuel",
      low && snapshot.playing && !snapshot.crashed,
    );

    // biome stage capsule
    const stageKey = `${snapshot.stageLabel}|${snapshot.stageName}|${snapshot.stageAccent}`;
    if (force || stageKey !== this.last.stage) {
      this.stageChip.textContent = `${snapshot.stageLabel} · ${snapshot.stageName}`;
      this.stageChip.style.setProperty("--stage-accent", snapshot.stageAccent);
      this.last.stage = stageKey;
    }

    // temporary power-up / combo chips
    const live = snapshot.playing && !snapshot.crashed;
    const nitro = live && snapshot.nitro > 0.03 ? snapshot.nitro : 0;
    const magnet = live && snapshot.magnet > 0.03 ? snapshot.magnet : 0;
    const combo = live ? Math.max(0, snapshot.combo) : 0;
    const nitroKey = Math.round(nitro * 10) / 10;
    const magnetKey = Math.round(magnet * 10) / 10;

    this.setHidden(this.nitroBuff, nitro <= 0);
    this.setHidden(this.magnetBuff, magnet <= 0);
    this.setHidden(this.comboChip, combo <= 0);
    this.setHidden(this.buffBar, nitro <= 0 && magnet <= 0 && combo <= 0);

    const nitroFill = Math.round(clamp(nitro / MAX_NITRO_TIME, 0, 1) * 1000) / 1000;
    const magnetFill = Math.round(clamp(magnet / MAGNET_DURATION, 0, 1) * 1000) / 1000;
    if (force || nitroFill !== this.last.nitroFill) {
      this.nitroFill.style.transform = `scaleX(${nitroFill})`;
      this.last.nitroFill = nitroFill;
    }
    if (force || magnetFill !== this.last.magnetFill) {
      this.magnetFill.style.transform = `scaleX(${magnetFill})`;
      this.last.magnetFill = magnetFill;
    }
    if (force || nitroKey !== this.last.nitro) {
      this.nitroTime.textContent = `${nitroKey.toFixed(1)}s`;
      this.last.nitro = nitroKey;
    }
    if (force || magnetKey !== this.last.magnet) {
      this.magnetTime.textContent = `${magnetKey.toFixed(1)}s`;
      this.last.magnet = magnetKey;
    }
    if (force || combo !== this.last.combo) {
      this.comboValue.textContent = String(combo);
      this.last.combo = combo;
    }

    const speed = Math.round(Math.abs(snapshot.speed) * 3.6);
    if (force || speed !== this.last.speed) {
      this.speedValue.textContent = String(speed);
      this.speedFill.style.transform = `scaleX(${clamp(speed / 110, 0, 1)})`;
      this.last.speed = speed;
    }

    const liveCam = Math.max(1, Math.round(snapshot.cameraWidth));
    const baseCam = clamp(
      Math.round(snapshot.baseCameraWidth),
      MIN_CAMERA_WIDTH,
      MAX_CAMERA_WIDTH,
    );
    const fovKey = `${liveCam}|${baseCam}`;
    if (force || fovKey !== this.last.fovKey) {
      this.hudFovValue.textContent = `${liveCam}m`;
      const baseLabel = `${baseCam}m · ${cameraWidthTag(baseCam)}`;
      this.pauseFovValue.textContent =
        liveCam !== baseCam ? `${baseLabel}（动态 ${liveCam}m）` : baseLabel;
      this.last.fovKey = fovKey;
    }
  }

  private setHidden(node: HTMLElement, hidden: boolean): void {
    if (node.hidden !== hidden) node.hidden = hidden;
  }

  setModeChip(
    label: string,
    tone: "standard" | "daily" | "challenge" = "standard",
  ): void {
    this.modeChip.textContent = label;
    this.modeChip.hidden = !label;
    this.modeChip.dataset.tone = tone;
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

  setCameraWidth(width: number, effectiveWidth?: number): void {
    const w = clamp(Math.round(width), MIN_CAMERA_WIDTH, MAX_CAMERA_WIDTH);
    const liveW =
      effectiveWidth !== undefined && Number.isFinite(effectiveWidth)
        ? Math.max(1, Math.round(effectiveWidth))
        : w;
    const label = `${w}m · ${cameraWidthTag(w)}`;
    this.hudFovValue.textContent = `${liveW}m`;
    this.introFovValue.textContent = label;
    this.pauseFovValue.textContent =
      liveW !== w ? `${label}（动态 ${liveW}m）` : label;
    this.last.fovKey = `${liveW}|${w}`;
    this.introFovRange.value = String(w);
    this.pauseFovRange.value = String(w);
    this.introFovRange.setAttribute("aria-valuetext", label);
    this.pauseFovRange.setAttribute("aria-valuetext", label);

    const atMin = w <= MIN_CAMERA_WIDTH;
    const atMax = w >= MAX_CAMERA_WIDTH;
    const atDefault = w === DEFAULT_CAMERA_WIDTH;
    this.introFovDecBtn.disabled = atMin;
    this.pauseFovDecBtn.disabled = atMin;
    this.introFovIncBtn.disabled = atMax;
    this.pauseFovIncBtn.disabled = atMax;
    this.introFovResetBtn.disabled = atDefault;
    this.pauseFovResetBtn.disabled = atDefault;
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
