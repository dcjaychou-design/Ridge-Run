import type {
  UpgradeDefinition,
  UpgradeLevels,
  VehicleConfig,
  VehicleId,
  VehicleStats,
} from "./types";

/* ---------- world / solver ---------- */
export const START_X = 6;
export const CHUNK = 44;
export const GOAL_STEP = 1 / 120;

export const GRAVITY = 10.2;
export const SPRING = 29000;
export const DAMPER = 1650;
export const BRAKE = 2550;
export const AIR_DAMPING = 0.26;
export const DUAL_PEDAL_DAMPING = 2.8;
export const GROUND_DAMPING = 0.7;

export const FUEL_BASE_CAPACITY = 100;
export const FUEL_PICKUP_AMOUNT = 34;
export const LOW_FUEL_RATIO = 0.2;
export const RESPAWN_FUEL_COST = 15;
export const CRASH_SETTLE_TIME = 1.35;

/* ---------- persistence ---------- */
export const SAVE_KEY = "ridge-run-v2";
export const LEGACY_SAVE_KEY = "ridge-run-v1";
export const MAX_UPGRADE_LEVEL = 10;

/* ---------- stunt scoring ---------- */
export const JUMP_STAGES = [
  { time: 0.35, reward: 1, title: "飞跃", color: "#f0b15e" },
  { time: 0.8, reward: 3, title: "大飞跃", color: "#89d8c8" },
  { time: 1.5, reward: 6, title: "超级飞跃", color: "#fff0bd" },
] as const;

/* ---------- vehicles ---------- */
export const VEHICLES: Record<VehicleId, VehicleConfig> = {
  rally: {
    id: "rally",
    number: "07",
    name: "阿尔卑斯拉力车",
    englishName: "ALPINE RALLY",
    tagline: "均衡 · 双轮驱动",
    blurb:
      "为山脊试炼打磨的经典双门拉力车。重心居中，抓地与姿态都足够宽容，是熟悉赛道的可靠伙伴。",
    accent: "#f0b15e",
    mass: 150,
    inertia: 152,
    wheelRadius: 0.46,
    engineBase: 1760,
    wheelPositions: [-1.08, 1.08],
    wheelLocalY: 0.34,
    wheelShares: [0.54, 0.46],
    rotTorque: 4.15,
    unlockCoins: 0,
    unlockBest: 0,
    chassisPoints: [
      { x: -1.48, y: 0.24 },
      { x: 0, y: 0.31 },
      { x: 1.52, y: 0.18 },
    ],
    roofPoints: [
      { x: -0.6, y: -0.62 },
      { x: 0.04, y: -0.58 },
      { x: 0.54, y: -0.6 },
    ],
    displayLength: 3.7,
    displayHeight: 2.05,
  },
  moto: {
    id: "moto",
    number: "12",
    name: "山脊轻骑",
    englishName: "RIDGE RUNNER",
    tagline: "轻量 · 空翻专家",
    blurb:
      "钢管车架与俯冲骑手的全地形轻骑。车轻、起速快，空中旋转扭矩极高，敢在断崖上多翻半圈。",
    accent: "#89d8c8",
    mass: 105,
    inertia: 82,
    wheelRadius: 0.44,
    engineBase: 1620,
    wheelPositions: [-0.94, 0.94],
    wheelLocalY: 0.34,
    wheelShares: [0.5, 0.5],
    rotTorque: 6.8,
    unlockCoins: 350,
    unlockBest: 600,
    chassisPoints: [
      { x: -0.98, y: 0.25 },
      { x: 0, y: 0.32 },
      { x: 1.02, y: 0.2 },
    ],
    roofPoints: [
      { x: -0.38, y: -0.58 },
      { x: 0.34, y: -0.94 },
      { x: 0.74, y: -0.48 },
    ],
    displayLength: 2.85,
    displayHeight: 2.15,
  },
  truck: {
    id: "truck",
    number: "88",
    name: "极地重卡",
    englishName: "POLAR HAULER",
    tagline: "重载 · 六轮三轴",
    blurb:
      "方头工业重卡，三轴六轮全部参与悬挂与驱动。车身沉、转向稳，翻车倾角阈值下几乎贴着山脊爬行。",
    accent: "#9ec7b4",
    mass: 245,
    inertia: 270,
    wheelRadius: 0.52,
    engineBase: 2650,
    wheelPositions: [-1.35, -0.2, 1.35],
    wheelLocalY: 0.34,
    wheelShares: [0.3, 0.36, 0.34],
    rotTorque: 2.7,
    unlockCoins: 900,
    unlockBest: 1200,
    chassisPoints: [
      { x: -2.18, y: 0.3 },
      { x: -0.1, y: 0.36 },
      { x: 2.12, y: 0.24 },
    ],
    roofPoints: [
      { x: -1.55, y: -1.0 },
      { x: 0.25, y: -1.06 },
      { x: 1.55, y: -0.98 },
    ],
    displayLength: 5.1,
    displayHeight: 2.45,
  },
};

export const VEHICLE_ORDER: VehicleId[] = ["rally", "moto", "truck"];

/* ---------- upgrades ---------- */
export const UPGRADES: UpgradeDefinition[] = [
  {
    key: "engine",
    label: "引擎",
    english: "ENGINE",
    blurb: "推力 +8% / 级",
    accent: "#f0b15e",
  },
  {
    key: "suspension",
    label: "悬挂",
    english: "SUSPENSION",
    blurb: "刚度 +4.5% · 阻尼 +6.5% / 级",
    accent: "#89d8c8",
  },
  {
    key: "tires",
    label: "轮胎",
    english: "TIRES",
    blurb: "抓地力 +7% / 级",
    accent: "#e1c79a",
  },
  {
    key: "fuel",
    label: "油箱",
    english: "FUEL TANK",
    blurb: "容量 +6 · 油耗 −4% / 级",
    accent: "#eb633a",
  },
];

export function upgradeCost(currentLevel: number): number {
  return Math.round(20 * Math.pow(1.42, currentLevel - 1));
}

export function deriveVehicleStats(
  upgrades: UpgradeLevels,
): VehicleStats {
  const engine = upgrades.engine - 1;
  const suspension = upgrades.suspension - 1;
  const tires = upgrades.tires - 1;
  const fuel = upgrades.fuel - 1;
  return {
    engineFactor: 1 + engine * 0.08,
    springFactor: 1 + suspension * 0.045,
    damperFactor: 1 + suspension * 0.065,
    gripFactor: 1 + tires * 0.07,
    fuelCapacity: FUEL_BASE_CAPACITY + fuel * 6,
    fuelBurnFactor: 1 - fuel * 0.04,
  };
}
