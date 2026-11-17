import type { AudioController } from "../audio/AudioController";
import { VEHICLES } from "../constants";
import { dailySeedFor, dailyVehicleFor, refreshDaily, seedHex, utcDateKey } from "../daily";
import {
  challengeFromHash,
  decodeChallengeCode,
  encodeGhostCode,
} from "../ghost/GhostSystem";
import { getSaveReport, persistSave } from "../storage";
import type { GameSave, GhostRecord, RunMode, VehicleId } from "../types";
import { byId } from "./dom";
import type { HudController } from "./HudController";
import type { Overlays } from "./Overlays";
import { extractChallengeFromPng, PosterGenerator } from "./PosterGenerator";

export interface RunSummary {
  mode: RunMode;
  modeLabel: string;
  vehicleId: VehicleId;
  distance: number;
  record: boolean;
  dailyRecord: boolean;
  challengeWin: boolean;
  rivalDistance: number;
  bounty: number;
  flips: number;
  bestCombo: number;
  highestStunt: string;
  runCoins: number;
  seed: number;
  dateKey: string;
  stageCount: number;
  challengeCode: string;
}

export interface ChallengeControllerDeps {
  save: GameSave;
  audio: AudioController;
  hud: HudController;
  overlays: Overlays;
}

function challengeLink(code: string): string {
  const base = location.href.split("#")[0] ?? location.href;
  return `${base}#challenge=${code}`;
}

function hasChallengeHash(hash: string): boolean {
  if (!hash || hash === "#") return false;
  const raw = hash.replace(/^#/, "");
  if (raw.startsWith("RR2.")) return true;
  try {
    return new URLSearchParams(raw).has("challenge");
  } catch (_) {
    return raw.includes("challenge=");
  }
}

function fallbackCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-9999px";
  area.style.opacity = "0";
  area.style.userSelect = "text";
  area.style.webkitUserSelect = "text";
  document.body.appendChild(area);
  area.focus();
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_) {
    copied = false;
  }
  area.remove();
  return copied;
}

export class ChallengeController {
  private readonly dailyBtnMeta = byId("dailyBtnMeta");
  private readonly challengeBtnMeta = byId("challengeBtnMeta");
  private readonly challengeBanner = byId("challengeBanner");
  private readonly challengeBannerTarget = byId("challengeBannerTarget");
  private readonly challengeBannerMeta = byId("challengeBannerMeta");
  private readonly challengeInput = byId<HTMLTextAreaElement>("challengeInput");
  private readonly challengeStatus = byId("challengeStatus");
  private readonly challengePngBtn = document.getElementById(
    "challengePngBtn",
  ) as HTMLButtonElement | null;
  private readonly challengePngInput = document.getElementById(
    "challengePngInput",
  ) as HTMLInputElement | null;
  private readonly posterCodeOutput = document.getElementById(
    "posterCodeOutput",
  ) as HTMLInputElement | null;

  private readonly deps: ChallengeControllerDeps;
  private readonly posterGenerator = new PosterGenerator();

  private loaded: GhostRecord | null = challengeFromHash(location.hash);
  private bootHashInvalid =
    hasChallengeHash(location.hash) && this.loaded === null;
  private summary: RunSummary | null = null;
  private posterReady = false;

  constructor(deps: ChallengeControllerDeps) {
    this.deps = deps;

    this.challengeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.loadFromInput();
      }
    });

    if (this.challengePngBtn && this.challengePngInput) {
      this.challengePngBtn.addEventListener("click", () => {
        this.deps.audio.ensure();
        this.challengePngInput!.value = "";
        this.challengePngInput!.click();
      });
      this.challengePngInput.addEventListener("change", () => {
        const file = this.challengePngInput?.files?.[0];
        if (file) void this.loadFromPngFile(file);
      });
    }

    if (this.posterCodeOutput) {
      this.posterCodeOutput.addEventListener("click", () => {
        this.posterCodeOutput?.select();
      });
    }
  }

  get loadedChallenge(): GhostRecord | null {
    return this.loaded;
  }

  get lastSummary(): RunSummary | null {
    return this.summary;
  }

  setLastSummary(summary: RunSummary | null): void {
    this.summary = summary;
    this.posterReady = false;
    if (this.posterCodeOutput) {
      this.posterCodeOutput.value = summary?.challengeCode ?? "";
    }
  }

  notifyInvalidBootHash(): void {
    if (!this.bootHashInvalid) return;
    this.bootHashInvalid = false;
    this.deps.hud.showToast(
      "战书链接无效",
      "挑战码损坏或被截断，请重新复制完整链接",
      "high",
    );
  }

  handleHashChange(): void {
    if (!location.hash) {
      if (this.loaded) {
        this.loaded = null;
        this.updateModeUi();
      }
      return;
    }
    const record = challengeFromHash(location.hash);
    if (record) {
      this.bootHashInvalid = false;
      this.loaded = record;
      this.updateModeUi();
      return;
    }
    if (hasChallengeHash(location.hash)) {
      this.loaded = null;
      this.updateModeUi();
      this.deps.audio.deny();
      this.deps.hud.showToast(
        "战书链接无效",
        "挑战码损坏或被截断，请重新复制完整链接",
        "high",
      );
    }
  }

  updateModeUi(): void {
    const { save } = this.deps;
    const today = utcDateKey();
    if (save.dailyDate !== today) {
      if (refreshDaily(save, today) && !getSaveReport().preserveRawPrimary) {
        persistSave(save, true);
      }
    }
    const seed = dailySeedFor(save.dailyDate || today);
    const vehicle = VEHICLES[dailyVehicleFor(seed)];
    const bestLine = save.dailyBest > 0 ? ` · 今日最佳 ${save.dailyBest}m` : "";
    this.dailyBtnMeta.textContent = `${save.dailyDate || today} · #${vehicle.number} ${vehicle.name}${bestLine}`;

    if (this.loaded) {
      const daily = this.loaded.mode === "daily";
      const ruleVehicle = daily
        ? dailyVehicleFor(this.loaded.seed)
        : this.loaded.vehicleId;
      const config = VEHICLES[ruleVehicle];
      this.challengeBanner.hidden = false;
      this.challengeBannerTarget.textContent = `目标 ${this.loaded.distance}m`;
      this.challengeBannerMeta.textContent = daily
        ? `每日战书 · 官方同车 #${config.number} ${config.name} · Lv.5 公平 · SEED ${seedHex(this.loaded.seed)}`
        : `常规战书 · 同地形自备车库 · 对手 #${config.number} ${config.name} · SEED ${seedHex(this.loaded.seed)}`;
      this.challengeBtnMeta.textContent = `已载入${daily ? "每日" : "常规"}战书 · 目标 ${this.loaded.distance}m`;
    } else {
      this.challengeBanner.hidden = true;
      this.challengeBtnMeta.textContent = "粘贴挑战码 / 导入战报 PNG";
    }
  }

  openChallengeModal(): void {
    const { audio, overlays } = this.deps;
    audio.ensure();
    this.challengeInput.value = this.loaded
      ? encodeGhostCode(this.loaded)
      : "";
    this.challengeStatus.dataset.tone = "";
    this.challengeStatus.textContent = this.loaded
      ? `当前已载入战书 · 目标 ${this.loaded.distance}m。粘贴新代码或导入战报 PNG 可替换。`
      : "";
    overlays.showChallenge();
  }

  loadFromInput(): void {
    const { audio, overlays, hud } = this.deps;
    const record = decodeChallengeCode(this.challengeInput.value);
    if (!record) {
      audio.deny();
      this.challengeStatus.dataset.tone = "error";
      this.challengeStatus.textContent =
        "挑战码损坏或格式不正确。请确认以 RR2. 开头，并完整复制。";
      return;
    }
    this.acceptChallenge(record);
    this.challengeStatus.dataset.tone = "ok";
    this.challengeStatus.textContent = `战书有效 · 目标 ${record.distance}m，已载入首页。`;
    audio.select();
    overlays.hideChallenge();
    hud.showToast("战书已加载", `目标 ${record.distance}m · 点击应战发车`);
  }

  async loadFromPngFile(file: File): Promise<void> {
    const { audio, overlays, hud } = this.deps;
    try {
      const buffer = await file.arrayBuffer();
      const extracted = extractChallengeFromPng(new Uint8Array(buffer));
      const record = extracted ? decodeChallengeCode(extracted) : null;
      if (!extracted || !record) {
        audio.deny();
        this.challengeStatus.dataset.tone = "error";
        this.challengeStatus.textContent =
          "未在该 PNG 中检测到有效的山脊战报挑战码（需使用游戏导出的战报 PNG）。";
        return;
      }
      this.challengeInput.value = extracted;
      this.acceptChallenge(record);
      this.challengeStatus.dataset.tone = "ok";
      this.challengeStatus.textContent = `战报 PNG 解析成功 · 目标 ${record.distance}m，已载入首页。`;
      audio.select();
      overlays.hideChallenge();
      hud.showToast("战报战书已导入", `目标 ${record.distance}m · 点击应战发车`);
    } catch (_) {
      audio.deny();
      this.challengeStatus.dataset.tone = "error";
      this.challengeStatus.textContent = "读取 PNG 文件失败，请重试或直接粘贴挑战码。";
    }
  }

  clearLoadedChallenge(): void {
    this.loaded = null;
    try {
      const base = location.href.split("#")[0] ?? location.href;
      history.replaceState(null, "", base);
    } catch (_) {
      /* ignore restricted history */
    }
    this.updateModeUi();
    this.deps.hud.showToast("战书已移除", "当前将按常规赛发车");
  }

  async copyChallengeLink(): Promise<void> {
    const code = this.currentShareCode();
    if (!code) {
      this.deps.hud.showToast("暂无可分享战书", "先完成一程，再复制挑战链接");
      return;
    }
    const target = this.summary?.distance ?? this.loaded?.distance ?? 0;
    await this.copyText(
      challengeLink(code),
      "战书链接已复制",
      `目标 ${target}m · 打开链接即可同屏竞速`,
    );
  }

  async openPoster(): Promise<void> {
    const { hud, overlays } = this.deps;
    if (!this.summary) {
      hud.showToast("尚无战报", "完成一程后再生成战术战报");
      return;
    }
    const summary = this.summary;
    this.posterReady = false;
    if (this.posterCodeOutput) {
      this.posterCodeOutput.value = summary.challengeCode;
    }
    overlays.showPoster();
    try {
      await this.posterGenerator.render({
        vehicleId: summary.vehicleId,
        distance: summary.distance,
        mode: summary.mode,
        modeLabel: summary.modeLabel,
        seed: summary.seed,
        dateKey: summary.dateKey,
        record: summary.record,
        dailyRecord: summary.dailyRecord,
        challengeWin: summary.challengeWin,
        runCoins: summary.runCoins,
        flips: summary.flips,
        bestCombo: summary.bestCombo,
        bounty: summary.bounty,
        stageCount: summary.stageCount,
        challengeCode: summary.challengeCode,
        generatedLabel: utcDateKey(),
      });
      this.posterReady = true;
    } catch (_) {
      this.posterReady = false;
      overlays.hidePoster();
      hud.showToast("战报生成失败", "请关闭弹窗后重试");
    }
  }

  downloadPoster(): void {
    const { hud } = this.deps;
    if (!this.summary) return;
    if (!this.posterReady) {
      hud.showToast("战报尚未生成", "请稍候再下载");
      return;
    }
    try {
      this.posterGenerator.download(this.summary.distance);
      hud.showToast(
        "PNG 已生成（内嵌完整战书）",
        `ridge-run-${this.summary.distance}m.png`,
      );
    } catch (_) {
      this.posterReady = false;
      hud.showToast("导出失败", "请重新生成战报后再试");
    }
  }

  private acceptChallenge(record: GhostRecord): void {
    this.loaded = record;
    try {
      const code = encodeGhostCode(record);
      history.replaceState(null, "", challengeLink(code));
    } catch (_) {
      /* file:// or restricted history: the banner still works this session */
    }
    this.updateModeUi();
  }

  private currentShareCode(): string | null {
    if (this.summary) {
      return this.summary.distance >= 1 && this.summary.challengeCode
        ? this.summary.challengeCode
        : null;
    }
    if (this.loaded && this.loaded.distance >= 1) {
      return encodeGhostCode(this.loaded);
    }
    return null;
  }

  private async copyText(
    text: string,
    main: string,
    detail: string,
  ): Promise<void> {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) {
      copied = false;
    }
    if (!copied) copied = fallbackCopy(text);
    if (copied) this.deps.hud.showToast(main, detail);
    else this.deps.hud.showToast("复制失败", "请手动选中挑战码复制");
  }
}
