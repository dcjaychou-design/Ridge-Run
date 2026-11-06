import {
  MISSION_TEMPLATES,
  missionDetail,
  missionProgressLabel,
  missionTitle,
} from "../missions";
import type { MissionState } from "../types";
import { clamp } from "../utils";
import { byId } from "./dom";

/**
 * Paints the three active pit contracts into the cockpit, pause screen and
 * result screen. Progress values are cached so a 120 Hz loop only touches
 * the DOM when a displayed number actually changes.
 */
export class MissionBoard {
  private readonly intro = byId("missionBoardList");
  private readonly pause = byId("pauseMissionList");
  private readonly result = byId("resultMissionList");
  private readonly keys = new Map<HTMLElement, string>();

  sync(missions: MissionState[], force = false): void {
    const key = missions
      .map(
        (mission) =>
          `${mission.id}:${mission.done ? 1 : 0}:${Math.round(
            mission.progress * 10,
          )}`,
      )
      .join("|");
    for (const target of [this.intro, this.pause, this.result]) {
      if (!force && this.keys.get(target) === key) continue;
      this.keys.set(target, key);
      target.innerHTML =
        missions.length > 0
          ? missions.map((mission, index) => this.row(mission, index)).join("")
          : '<p class="mission-empty">暂无悬赏</p>';
    }
  }

  private row(mission: MissionState, index: number): string {
    const template = MISSION_TEMPLATES[mission.kind];
    const ratio = clamp(mission.progress / Math.max(1, mission.target), 0, 1);
    const width = (ratio * 100).toFixed(1);
    const done = mission.done;
    return `<div class="mission-row${done ? " is-done" : ""}" style="--mission-accent:${template.accent}" title="${missionDetail(mission)}">
      <span class="mission-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="mission-main">
        <div class="mission-line"><strong>${missionTitle(mission)}</strong><span>${missionProgressLabel(mission)}</span></div>
        <div class="mission-bar" role="progressbar" aria-label="${missionTitle(mission)}进度" aria-valuemin="0" aria-valuemax="${mission.target}" aria-valuenow="${mission.progress}"><i style="width:${width}%"></i></div>
      </div>
      <span class="mission-reward">${done ? '<b class="mission-check">✓</b>' : ""}<span class="coin-mark" aria-hidden="true"></span>${mission.reward}</span>
    </div>`;
  }
}
