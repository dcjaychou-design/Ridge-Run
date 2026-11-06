import { MISSION_SLOTS } from "./constants";
import type { MissionKind, MissionState } from "./types";
import { clamp, mulberry32 } from "./utils";

export interface MissionTemplate {
  label: string;
  english: string;
  unit: string;
  accent: string;
  targets: number[];
  rewards: number[];
}

export const MISSION_TEMPLATES: Record<MissionKind, MissionTemplate> = {
  distance: {
    label: "长途奔袭",
    english: "DISTANCE",
    unit: "m",
    accent: "#f0b15e",
    targets: [300, 600, 1000],
    rewards: [35, 50, 65],
  },
  flips: {
    label: "空中转体",
    english: "FLIPS",
    unit: "圈",
    accent: "#eb633a",
    targets: [1, 2, 3],
    rewards: [40, 60, 75],
  },
  perfect: {
    label: "完美落地",
    english: "PERFECT",
    unit: "次",
    accent: "#89d8c8",
    targets: [2, 3, 4],
    rewards: [40, 55, 70],
  },
  coins: {
    label: "金币矿脉",
    english: "COINS",
    unit: "枚",
    accent: "#e1c79a",
    targets: [18, 32, 50],
    rewards: [30, 42, 55],
  },
  wheelie: {
    label: "单轮平衡",
    english: "WHEELIE",
    unit: "s",
    accent: "#8ca494",
    targets: [2, 4],
    rewards: [45, 45],
  },
  stage: {
    label: "深入秘境",
    english: "STAGE",
    unit: "m",
    accent: "#9fe8da",
    targets: [500, 1000],
    rewards: [50, 80],
  },
};

const KINDS: MissionKind[] = [
  "distance",
  "flips",
  "perfect",
  "coins",
  "wheelie",
  "stage",
];

export interface MissionProgress {
  distance: number;
  flips: number;
  perfect: number;
  coins: number;
  wheelie: number;
  stage: number;
}

function tierFor(kind: MissionKind, completed: number): number {
  const template = MISSION_TEMPLATES[kind];
  return Math.min(template.targets.length - 1, Math.floor(completed / 5));
}

export function missionTitle(mission: MissionState): string {
  if (mission.kind === "stage") {
    return mission.target >= 1000 ? "驶入赤岩峡谷" : "驶入高寒冰川";
  }
  return MISSION_TEMPLATES[mission.kind].label;
}

export function missionDetail(mission: MissionState): string {
  const template = MISSION_TEMPLATES[mission.kind];
  switch (mission.kind) {
    case "distance":
      return `单局行驶 ${mission.target}m`;
    case "flips":
      return `单局完成 ${mission.target} 次 360° 空翻`;
    case "perfect":
      return `单局达成 ${mission.target} 次完美落地`;
    case "coins":
      return `单局收集 ${mission.target} 枚金币`;
    case "wheelie":
      return `单局累计单轮平衡 ${mission.target}s`;
    case "stage":
      return mission.target >= 1000
        ? "单局驶入赤岩峡谷（1000m）"
        : "单局驶入高寒冰川（500m）";
    default:
      return `${template.label} ${mission.target}${template.unit}`;
  }
}

export function missionProgressLabel(mission: MissionState): string {
  const template = MISSION_TEMPLATES[mission.kind];
  const current =
    mission.kind === "wheelie"
      ? mission.progress.toFixed(1)
      : String(Math.floor(mission.progress));
  const target =
    mission.kind === "wheelie" ? mission.target.toFixed(1) : String(mission.target);
  return `${current} / ${target}${template.unit}`;
}

/** Roll one mission, never repeating a kind that is already active. */
export function rollMission(
  completed: number,
  avoid: readonly MissionKind[],
  random: () => number = Math.random,
): MissionState {
  const available = KINDS.filter((kind) => !avoid.includes(kind));
  const pool = available.length > 0 ? available : KINDS;
  const kind = pool[Math.floor(random() * pool.length)] ?? KINDS[0]!;
  const tier = tierFor(kind, completed);
  const template = MISSION_TEMPLATES[kind];
  const target = template.targets[tier]!;
  return {
    id: `${kind}-${target}`,
    kind,
    target,
    reward: template.rewards[tier]!,
    progress: 0,
    done: false,
  };
}

export function rollMissions(
  completed: number,
  avoid: readonly MissionKind[] = [],
  random: () => number = Math.random,
  count = MISSION_SLOTS,
): MissionState[] {
  const out: MissionState[] = [];
  const used = [...avoid];
  for (let i = 0; i < count; i++) {
    const mission = rollMission(completed, used, random);
    used.push(mission.kind);
    out.push(mission);
  }
  return out;
}

/** Deterministic starter board used when a save has no valid missions. */
export function defaultMissions(): MissionState[] {
  return rollMissions(0, [], mulberry32(0x5eed), MISSION_SLOTS);
}

function valueFor(kind: MissionKind, progress: MissionProgress): number {
  switch (kind) {
    case "distance":
      return progress.distance;
    case "flips":
      return progress.flips;
    case "perfect":
      return progress.perfect;
    case "coins":
      return progress.coins;
    case "wheelie":
      return progress.wheelie;
    case "stage":
      return progress.stage;
    default:
      return 0;
  }
}

/**
 * Owns the three live contracts. Progress is per-run; completed contracts
 * are replaced at the end of the run with a fresh, non-duplicate kind.
 */
export class MissionTracker {
  readonly missions: MissionState[];

  constructor(missions: MissionState[]) {
    this.missions = missions;
  }

  reset(): void {
    for (const mission of this.missions) {
      mission.progress = 0;
      mission.done = false;
    }
  }

  update(progress: MissionProgress): MissionState[] {
    const completed: MissionState[] = [];
    for (const mission of this.missions) {
      if (mission.done) continue;
      const value = valueFor(mission.kind, progress);
      const clamped = clamp(value, 0, mission.target);
      mission.progress =
        mission.kind === "wheelie"
          ? Math.round(clamped * 10) / 10
          : Math.floor(clamped);
      if (value >= mission.target) {
        mission.done = true;
        mission.progress = mission.target;
        completed.push(mission);
      }
    }
    return completed;
  }

  /**
   * Swap every completed contract for a new one and clear the per-run
   * progress of the survivors. Mutates the shared save array in place.
   */
  rotate(completedCount: number, random: () => number = Math.random): void {
    const used: MissionKind[] = this.missions
      .filter((mission) => !mission.done)
      .map((mission) => mission.kind);
    for (let i = 0; i < this.missions.length; i++) {
      const mission = this.missions[i]!;
      if (!mission.done) continue;
      const replacement = rollMission(completedCount, used, random);
      used.push(replacement.kind);
      this.missions[i] = replacement;
    }
    this.reset();
  }
}
