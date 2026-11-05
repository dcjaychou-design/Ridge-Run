import {
  MAX_UPGRADE_LEVEL,
  UPGRADES,
  VEHICLES,
  VEHICLE_ORDER,
  upgradeCost,
} from "../constants";
import { VehicleRenderer } from "../render/VehicleRenderer";
import type {
  GameSave,
  UpgradeDefinition,
  UpgradeKey,
  VehicleConfig,
  VehicleId,
} from "../types";
import { clamp, formatCoins } from "../utils";
import { byId } from "./dom";
import { closeOverlay, openOverlay } from "./Overlays";

export type GarageActionKind = "upgrade" | "unlock" | "select";

export interface GarageCallbacks {
  /** The shared save object has already been mutated. */
  onAction: (kind: GarageActionKind) => void;
  onClose: () => void;
}

interface UpgradeRow {
  def: UpgradeDefinition;
  row: HTMLElement;
  pips: HTMLElement[];
  level: HTMLElement;
  cost: HTMLElement;
  button: HTMLButtonElement;
}

/**
 * Alpine-dusk pit garage: vehicle carousel, four 10-step upgrade ladders,
 * coin balance and per-vehicle unlock rules.
 */
export class GarageModal {
  private readonly root = byId("garageOverlay");
  private readonly closeBtn = byId<HTMLButtonElement>("garageCloseBtn");
  private readonly doneBtn = byId<HTMLButtonElement>("garageDoneBtn");
  private readonly prevBtn = byId<HTMLButtonElement>("vehiclePrevBtn");
  private readonly nextBtn = byId<HTMLButtonElement>("vehicleNextBtn");
  private readonly tag = byId("garageVehicleTag");
  private readonly name = byId("garageVehicleName");
  private readonly tagline = byId("garageVehicleTagline");
  private readonly blurb = byId("garageVehicleBlurb");
  private readonly state = byId("garageVehicleState");
  private readonly specs = byId("garageVehicleSpecs");
  private readonly dots = byId("garageDots");
  private readonly upgradeList = byId("garageUpgradeList");
  private readonly coinValue = byId("garageCoins");
  private readonly actionBtn = byId<HTMLButtonElement>("garageActionBtn");
  private readonly preview = byId<HTMLCanvasElement>("garagePreview");

  private readonly save: GameSave;
  private readonly callbacks: GarageCallbacks;
  private readonly renderer = new VehicleRenderer();
  private readonly rows: UpgradeRow[] = [];
  private readonly dotButtons: HTMLButtonElement[] = [];
  private index = 0;
  private openFlag = false;

  constructor(save: GameSave, callbacks: GarageCallbacks) {
    this.save = save;
    this.callbacks = callbacks;

    this.closeBtn.addEventListener("click", () => this.close());
    this.doneBtn.addEventListener("click", () => this.close());
    this.prevBtn.addEventListener("click", () => this.cycle(-1));
    this.nextBtn.addEventListener("click", () => this.cycle(1));
    this.actionBtn.addEventListener("click", () => this.runAction());

    for (const def of UPGRADES) {
      const row = document.createElement("div");
      row.className = "upgrade-row";
      row.dataset.key = def.key;
      row.innerHTML = `
        <div class="upgrade-name"><span>${def.label}</span><small>${def.english}</small></div>
        <div class="upgrade-core">
          <div class="upgrade-pips" aria-hidden="true">${Array.from(
            { length: MAX_UPGRADE_LEVEL },
            () => '<i class="upgrade-pip"></i>',
          ).join("")}</div>
          <p class="upgrade-effect">${def.blurb}</p>
        </div>
        <span class="upgrade-level">Lv.<b>1</b></span>
        <button class="upgrade-buy" type="button" aria-label="升级${def.label}">
          <span class="coin-mark" aria-hidden="true"></span>
          <span class="upgrade-cost">20</span>
          <span class="upgrade-max">MAX</span>
        </button>`;
      const buy = row.querySelector<HTMLButtonElement>(".upgrade-buy");
      if (!buy) throw new Error("upgrade button missing");
      buy.addEventListener("click", () => this.buyUpgrade(def.key));
      this.rows.push({
        def,
        row,
        pips: Array.from(row.querySelectorAll<HTMLElement>(".upgrade-pip")),
        level: row.querySelector<HTMLElement>(".upgrade-level")!,
        cost: row.querySelector<HTMLElement>(".upgrade-cost")!,
        button: buy,
      });
      this.upgradeList.appendChild(row);
    }

    for (const id of VEHICLE_ORDER) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "vehicle-dot";
      dot.setAttribute("aria-label", VEHICLES[id].name);
      dot.addEventListener("click", () => {
        this.index = VEHICLE_ORDER.indexOf(id);
        this.render();
      });
      this.dotButtons.push(dot);
      this.dots.appendChild(dot);
    }
  }

  get isOpen(): boolean {
    return this.openFlag;
  }

  get currentVehicle(): VehicleConfig {
    return VEHICLES[VEHICLE_ORDER[this.index]!];
  }

  open(): void {
    this.index = Math.max(
      0,
      VEHICLE_ORDER.indexOf(this.save.selectedVehicle),
    );
    this.openFlag = true;
    this.render();
    openOverlay(this.root, this.closeBtn);
    this.drawPreview(performance.now() / 1000);
  }

  close(): void {
    if (!this.openFlag) return;
    this.openFlag = false;
    closeOverlay(this.root);
    this.callbacks.onClose();
  }

  cycle(dir: number): void {
    if (!this.openFlag) return;
    const count = VEHICLE_ORDER.length;
    this.index = (this.index + dir + count) % count;
    this.render();
  }

  tick(time: number): void {
    if (!this.openFlag) return;
    this.drawPreview(time);
  }

  private get currentId(): VehicleId {
    return VEHICLE_ORDER[this.index]!;
  }

  private isUnlocked(id: VehicleId): boolean {
    return this.save.unlockedVehicles.includes(id);
  }

  private render(): void {
    const config = this.currentVehicle;
    const unlocked = this.isUnlocked(config.id);
    const selected = this.save.selectedVehicle === config.id;

    this.tag.textContent = `#${config.number} · ${config.englishName}`;
    this.name.textContent = config.name;
    this.tagline.textContent = config.tagline;
    this.blurb.textContent = config.blurb;

    if (selected) {
      this.state.textContent = "出战中 · 本车已完成整备";
      this.state.dataset.tone = "active";
    } else if (unlocked) {
      this.state.textContent = "已解锁 · 可立即切换";
      this.state.dataset.tone = "ready";
    } else if (this.save.best >= config.unlockBest) {
      this.state.textContent = `未解锁 · 里程门槛 ${config.unlockBest}m 已达成`;
      this.state.dataset.tone = "ready";
    } else {
      this.state.textContent = `未解锁 · 最佳 ${this.save.best}m / 门槛 ${config.unlockBest}m`;
      this.state.dataset.tone = "locked";
    }

    this.specs.innerHTML = [
      ["质量", String(config.mass)],
      ["推力", String(config.engineBase)],
      [
        "轮组",
        `${config.wheelPositions.length * (config.id === "truck" ? 2 : 1)} 轮`,
      ],
      ["空翻扭矩", config.rotTorque.toFixed(2)],
    ]
      .map(
        ([label, value]) =>
          `<span class="vehicle-spec"><small>${label}</small><b>${value}</b></span>`,
      )
      .join("");

    this.dotButtons.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === this.index);
      dot.classList.toggle(
        "is-locked",
        !this.isUnlocked(VEHICLE_ORDER[i]!),
      );
    });

    this.renderUpgrades(!unlocked);
    this.renderAction(config, unlocked, selected);
    this.coinValue.textContent = formatCoins(this.save.coins);
    this.drawPreview(performance.now() / 1000);
  }

  private renderUpgrades(locked: boolean): void {
    const levels = this.save.upgrades[this.currentId];
    for (const row of this.rows) {
      const level = levels[row.def.key];
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = upgradeCost(level);
      row.pips.forEach((pip, i) => {
        pip.classList.toggle("is-on", i < level);
        pip.classList.toggle("is-next", i === level && !maxed);
      });
      row.level.innerHTML = `Lv.<b>${level}</b>`;
      row.cost.textContent = String(cost);
      row.button.disabled = locked || maxed || this.save.coins < cost;
      row.button.classList.toggle("is-max", maxed);
      row.button.classList.toggle(
        "is-affordable",
        !locked && !maxed && this.save.coins >= cost,
      );
      row.button.setAttribute(
        "aria-label",
        locked
          ? `解锁车辆后可改装${row.def.label}`
          : maxed
            ? `${row.def.label}已满级`
            : `升级${row.def.label}，花费 ${cost} 金币`,
      );
      row.row.classList.toggle("is-max", maxed);
      row.row.classList.toggle("is-locked", locked);
      row.row.classList.toggle(
        "is-poor",
        !locked && !maxed && this.save.coins < cost,
      );
    }
  }

  private renderAction(
    config: VehicleConfig,
    unlocked: boolean,
    selected: boolean,
  ): void {
    const button = this.actionBtn;
    button.disabled = false;
    button.dataset.action = "none";
    button.classList.remove("is-disabled");

    if (selected) {
      button.textContent = "本车出战中";
      button.disabled = true;
      button.classList.add("is-disabled");
      return;
    }
    if (unlocked) {
      button.textContent = "切换至该车";
      button.dataset.action = "select";
      return;
    }
    if (this.save.best >= config.unlockBest) {
      button.textContent = "里程达成 · 免费解锁";
      button.dataset.action = "unlock-free";
      return;
    }
    if (this.save.coins >= config.unlockCoins) {
      button.textContent = `解锁车辆 · ${config.unlockCoins} 金币`;
      button.dataset.action = "unlock";
      return;
    }
    button.textContent = `未解锁 · ${config.unlockBest}m 或 ${config.unlockCoins} 金币`;
    button.disabled = true;
    button.classList.add("is-disabled");
  }

  private runAction(): void {
    const config = this.currentVehicle;
    if (this.isUnlocked(config.id)) {
      if (this.save.selectedVehicle === config.id) return;
      this.save.selectedVehicle = config.id;
      this.callbacks.onAction("select");
      this.render();
      return;
    }

    const free = this.save.best >= config.unlockBest;
    if (!free) {
      if (this.save.coins < config.unlockCoins) return;
      this.save.coins -= config.unlockCoins;
    }
    if (!this.save.unlockedVehicles.includes(config.id)) {
      this.save.unlockedVehicles.push(config.id);
    }
    this.save.selectedVehicle = config.id;
    this.callbacks.onAction("unlock");
    this.render();
  }

  private buyUpgrade(key: UpgradeKey): void {
    const levels = this.save.upgrades[this.currentId];
    const level = levels[key];
    if (level >= MAX_UPGRADE_LEVEL) return;
    const cost = upgradeCost(level);
    if (this.save.coins < cost) return;
    this.save.coins -= cost;
    levels[key] = clamp(level + 1, 1, MAX_UPGRADE_LEVEL);
    this.callbacks.onAction("upgrade");
    this.render();
  }

  private drawPreview(time: number): void {
    const ctx = this.preview.getContext("2d");
    if (!ctx) return;
    const rect = this.preview.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.preview.width !== width || this.preview.height !== height) {
      this.preview.width = width;
      this.preview.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    this.renderer.drawPreview(
      ctx,
      rect.width,
      rect.height,
      this.currentVehicle,
      time,
    );
  }
}
