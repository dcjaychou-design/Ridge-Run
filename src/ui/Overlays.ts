import type { RunResult } from "../types";
import { byId } from "./dom";

const openStack: HTMLElement[] = [];
const previousFocus = new WeakMap<HTMLElement, HTMLElement | null>();
let trapBound = false;

function focusables(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (node) => node.offsetParent !== null || node === document.activeElement,
  );
}

function bindFocusTrap(): void {
  if (trapBound) return;
  trapBound = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || openStack.length === 0) return;
    const top = openStack[openStack.length - 1]!;
    const items = focusables(top);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !top.contains(active)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });
}

export function openOverlay(node: HTMLElement, focusTarget?: HTMLElement): void {
  bindFocusTrap();
  if (!node.classList.contains("is-hidden") && openStack.includes(node)) {
    focusTarget?.focus({ preventScroll: true });
    return;
  }
  if (!previousFocus.has(node)) {
    previousFocus.set(node, document.activeElement as HTMLElement | null);
  }
  node.classList.remove("is-hidden");
  node.removeAttribute("inert");
  node.setAttribute("aria-hidden", "false");
  const existing = openStack.indexOf(node);
  if (existing >= 0) openStack.splice(existing, 1);
  openStack.push(node);
  if (focusTarget) {
    window.setTimeout(() => {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (_) {
        /* element may have been hidden meanwhile */
      }
    }, 60);
  }
}

export function closeOverlay(node: HTMLElement): void {
  if (node.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  node.classList.add("is-hidden");
  node.setAttribute("inert", "");
  node.setAttribute("aria-hidden", "true");
  const index = openStack.indexOf(node);
  if (index >= 0) openStack.splice(index, 1);

  const restore = previousFocus.get(node);
  previousFocus.delete(node);
  if (restore && restore.isConnected) {
    window.setTimeout(() => {
      if (restore.closest(".is-hidden,[inert]")) return;
      try {
        restore.focus({ preventScroll: true });
      } catch (_) {
        /* ignore */
      }
    }, 0);
  }
}

export function isOverlayOpen(node: HTMLElement): boolean {
  return openStack.includes(node);
}

export function topOverlay(): HTMLElement | null {
  return openStack[openStack.length - 1] ?? null;
}

export interface PauseSnapshot {
  distance: number;
  coins: number;
  fuelPercent: number;
}

export class Overlays {
  readonly intro = byId("intro");
  readonly pause = byId("pauseOverlay");
  readonly over = byId("overOverlay");
  readonly challenge = byId("challengeOverlay");
  readonly poster = byId("posterOverlay");

  private readonly pauseDistance = byId("pauseDistance");
  private readonly pauseCoins = byId("pauseCoins");
  private readonly pauseFuel = byId("pauseFuel");
  private readonly resumeBtn = byId<HTMLButtonElement>("resumeBtn");
  private readonly againBtn = byId<HTMLButtonElement>("againBtn");
  private readonly overTitle = byId("overTitle");
  private readonly overCopy = byId("overCopy");
  private readonly resultDistance = byId("resultDistance");
  private readonly resultCoins = byId("resultCoins");
  private readonly resultBest = byId("resultBest");
  private readonly resultBestLabel = byId("resultBestLabel");
  private readonly resultStunt = byId("resultStunt");
  private readonly resultGhost = byId("resultGhost");
  private readonly resultBounty = byId("resultBounty");
  private readonly newRecord = byId("newRecord");
  private readonly challengeInput = byId<HTMLTextAreaElement>("challengeInput");
  private readonly posterDownloadBtn = byId<HTMLButtonElement>("posterDownloadBtn");

  showIntro(): void {
    openOverlay(this.intro);
  }

  hideIntro(): void {
    closeOverlay(this.intro);
  }

  showPause(snapshot: PauseSnapshot): void {
    this.pauseDistance.innerHTML = `${Math.floor(snapshot.distance)}<small>m</small>`;
    this.pauseCoins.textContent = String(snapshot.coins);
    this.pauseFuel.innerHTML = `${snapshot.fuelPercent}<small>%</small>`;
    openOverlay(this.pause, this.resumeBtn);
  }

  hidePause(): void {
    closeOverlay(this.pause);
  }

  showResult(result: RunResult): void {
    this.resultDistance.innerHTML = `${result.distance}<small>m</small>`;
    this.resultCoins.textContent = String(result.coins);
    this.resultBest.innerHTML = `${result.best}<small>m</small>`;
    this.resultBestLabel.textContent =
      result.mode === "daily" ? "今日最佳" : "个人最佳";
    this.resultStunt.textContent = result.highlightStunt || "—";
    this.resultGhost.textContent = result.ghostOutcome || "—";
    this.resultBounty.textContent = result.bounty > 0 ? `+${result.bounty}` : "+0";

    const achieved = result.record || result.challengeWin || result.dailyRecord;
    this.overTitle.classList.toggle(
      "is-long",
      result.mode === "challenge" && result.challengeWin,
    );
    this.newRecord.hidden = !achieved;
    this.newRecord.textContent = result.challengeWin
      ? "击败对手 · 战书告捷"
      : result.dailyRecord
        ? "今日最佳刷新"
        : "新的个人纪录";

    if (result.mode === "challenge") {
      if (result.challengeWin) {
        this.overTitle.textContent = "挑战成功 · 击败对手";
        this.overCopy.textContent =
          "山脊战书已盖章。把这个链接传下去，等待下一位应战者。";
      } else {
        const gap = Math.max(0, result.rivalDistance - result.distance);
        this.overTitle.textContent = "战书未破";
        this.overCopy.textContent = `距离对手还差 ${gap}m。换一条走线，再向山脊要一次机会。`;
      }
    } else if (result.mode === "daily") {
      this.overTitle.textContent =
        result.reason === "crash" ? "试炼中止" : "试炼结束";
      this.overCopy.textContent = result.dailyRecord
        ? `今日最佳刷新至 ${result.best}m。明日 UTC 零点，新的山脊会重新生成。`
        : "今日试炼成绩已记录。明日 UTC 零点，新的种子与官方车型会重新抽取。";
    } else if (result.reason === "crash") {
      this.overTitle.textContent = "翻车出局";
      this.overCopy.textContent = result.record
        ? "虽然失控翻覆，但山脊记住了你的新纪录！"
        : "车身失控翻覆。稳住重心，下一程冲得更远。";
    } else {
      this.overTitle.textContent = "油箱见底";
      this.overCopy.textContent = result.record
        ? "山脊替你记下了这一程。新的个人纪录，已经在路上。"
        : "山脊替你收下了这一程。下一次，把发车点甩得更远。";
    }
    openOverlay(this.over, this.againBtn);
  }

  hideResult(): void {
    closeOverlay(this.over);
  }

  showChallenge(): void {
    openOverlay(this.challenge, this.challengeInput);
  }

  hideChallenge(): void {
    closeOverlay(this.challenge);
  }

  showPoster(): void {
    openOverlay(this.poster, this.posterDownloadBtn);
  }

  hidePoster(): void {
    closeOverlay(this.poster);
  }

  hideAll(): void {
    closeOverlay(this.intro);
    closeOverlay(this.pause);
    closeOverlay(this.over);
    closeOverlay(this.challenge);
    closeOverlay(this.poster);
  }
}
