import {
  BIOME_TRANSITION,
  ICE_GRIP,
  MUD_GRIP,
  STAGE_LENGTH,
  START_X,
  TIRE_PENALTY_OFFSET,
} from "../constants";
import type {
  BiomeId,
  BiomePalette,
  StageInfo,
  SurfacePatch,
  SurfaceState,
  UpdraftVent,
} from "../types";
import { clamp, lerp, mixHex, mulberry32, smoothstep, TAU } from "../utils";
import { heightAt } from "./terrain";

interface BiomeDefinition {
  id: BiomeId;
  name: string;
  english: string;
  hint: string;
  accent: string;
  palette: BiomePalette;
}

/* ---------- palettes (Alpine Dusk family) ---------- */
const ALPINE: BiomePalette = {
  skyTop: "#081b20",
  skyUpper: "#15363b",
  skyMid: "#46615e",
  skyLow: "#a67358",
  skyHorizon: "#e2a363",
  skyBottom: "#8a7b5e",
  sunGlow: "#ffda93",
  sunCore: "#fff1c6",
  sunEdge: "#eaa05f",
  sunAlpha: 1,
  starAlpha: 0.38,
  cloudAlpha: 1,
  aurora: 0,
  birdAlpha: 1,
  farTop: "#b2a58e",
  farBottom: "#7a887e",
  midTop: "#6b8077",
  midBottom: "#3e594f",
  nearTop: "#2b4a3f",
  nearBottom: "#0c2620",
  crestColor: "#f4d7a2",
  crestAlpha: 0.2,
  treeColor: "#081914",
  treeAlpha: 0.38,
  snowCap: 0,
  hazeColor: "#f0b15e",
  hazeAlpha: 0.13,
  groundTop: "#214638",
  groundUpper: "#102a20",
  groundMid: "#0a1d17",
  groundBottom: "#05120e",
  rim: "#e9ae60",
  rimHalo: "#eb633a",
  rimSoft: "#ffeec6",
  strataColor: "#e2ae67",
  detailColor: "#e6b570",
  rockColor: "#243a2e",
  detailStyle: "pine",
  atmosphere: "mote",
  nightFactor: 0,
};

const GLACIER: BiomePalette = {
  skyTop: "#071a2a",
  skyUpper: "#123344",
  skyMid: "#3b6474",
  skyLow: "#8bb0b7",
  skyHorizon: "#dcecec",
  skyBottom: "#7e9aa0",
  sunGlow: "#dff6ff",
  sunCore: "#ffffff",
  sunEdge: "#cfe9f2",
  sunAlpha: 0.72,
  starAlpha: 0.1,
  cloudAlpha: 0.75,
  aurora: 0,
  birdAlpha: 0.3,
  farTop: "#d7e8ec",
  farBottom: "#8eaeb6",
  midTop: "#9fc1c5",
  midBottom: "#5c818a",
  nearTop: "#557a82",
  nearBottom: "#1d3d47",
  crestColor: "#f4feff",
  crestAlpha: 0.3,
  treeColor: "#16323a",
  treeAlpha: 0.24,
  snowCap: 0.26,
  hazeColor: "#bcdde4",
  hazeAlpha: 0.12,
  groundTop: "#b8d5d8",
  groundUpper: "#8fb2b6",
  groundMid: "#5c7f86",
  groundBottom: "#2c4a53",
  rim: "#f2ffff",
  rimHalo: "#9fe0e6",
  rimSoft: "#ffffff",
  strataColor: "#bfe9ea",
  detailColor: "#eafcff",
  rockColor: "#5c818a",
  detailStyle: "snow",
  atmosphere: "snow",
  nightFactor: 0,
};

const CANYON: BiomePalette = {
  skyTop: "#1a0f18",
  skyUpper: "#3b1b24",
  skyMid: "#7b3030",
  skyLow: "#c05b3e",
  skyHorizon: "#f0a05c",
  skyBottom: "#8a4a37",
  sunGlow: "#ffc27a",
  sunCore: "#ffe9b8",
  sunEdge: "#e8753f",
  sunAlpha: 1.1,
  starAlpha: 0.06,
  cloudAlpha: 0.5,
  aurora: 0,
  birdAlpha: 0.15,
  farTop: "#d69a76",
  farBottom: "#96604f",
  midTop: "#a95f49",
  midBottom: "#6f3730",
  nearTop: "#5a2a25",
  nearBottom: "#251211",
  crestColor: "#ffc98f",
  crestAlpha: 0.24,
  treeColor: "#2a1512",
  treeAlpha: 0,
  snowCap: 0,
  hazeColor: "#ff9d62",
  hazeAlpha: 0.16,
  groundTop: "#a9523c",
  groundUpper: "#793727",
  groundMid: "#4c2119",
  groundBottom: "#2a110d",
  rim: "#ffb37a",
  rimHalo: "#eb633a",
  rimSoft: "#ffe1b8",
  strataColor: "#f2a063",
  detailColor: "#e8b06f",
  rockColor: "#5d2a1f",
  detailStyle: "rock",
  atmosphere: "sand",
  nightFactor: 0,
};

const SUMMIT: BiomePalette = {
  skyTop: "#030a18",
  skyUpper: "#071a2e",
  skyMid: "#0d2c3e",
  skyLow: "#123c46",
  skyHorizon: "#1d5354",
  skyBottom: "#08161a",
  sunGlow: "#a8f5e0",
  sunCore: "#d9fff4",
  sunEdge: "#4fd6bd",
  sunAlpha: 0.16,
  starAlpha: 1.15,
  cloudAlpha: 0.28,
  aurora: 1,
  birdAlpha: 0.1,
  farTop: "#203b4a",
  farBottom: "#122a35",
  midTop: "#16363c",
  midBottom: "#0a2429",
  nearTop: "#0c2526",
  nearBottom: "#041113",
  crestColor: "#9fe8da",
  crestAlpha: 0.25,
  treeColor: "#020d0e",
  treeAlpha: 0.5,
  snowCap: 0.06,
  hazeColor: "#3b8f88",
  hazeAlpha: 0.12,
  groundTop: "#163b3c",
  groundUpper: "#0c2a2a",
  groundMid: "#071c1e",
  groundBottom: "#020c0d",
  rim: "#7fe0ce",
  rimHalo: "#2fa99a",
  rimSoft: "#d8fff5",
  strataColor: "#6fb8a8",
  detailColor: "#a7e8da",
  rockColor: "#0b2224",
  detailStyle: "aurora",
  atmosphere: "night",
  nightFactor: 1,
};

const BIOMES: BiomeDefinition[] = [
  {
    id: "alpine",
    name: "晨雾松林",
    english: "MISTY PINES",
    hint: "路面稳定，找回爬坡节奏",
    accent: "#f0b15e",
    palette: ALPINE,
  },
  {
    id: "glacier",
    name: "高寒冰川",
    english: "GLACIER RIDGE",
    hint: "路面结冰，注意控油与轮胎抓地",
    accent: "#89d8c8",
    palette: GLACIER,
  },
  {
    id: "canyon",
    name: "赤岩峡谷",
    english: "RED CANYON",
    hint: "泥泞洼地，保持推力冲出陷车带",
    accent: "#e3784c",
    palette: CANYON,
  },
  {
    id: "summit",
    name: "极夜山巅",
    english: "NIGHT SUMMIT",
    hint: "夜色降临，开启大灯，借助上升气流",
    accent: "#9fe8da",
    palette: SUMMIT,
  },
];

/* ---------- palette blending ---------- */
export function blendPalettes(
  a: BiomePalette,
  b: BiomePalette,
  t: number,
): BiomePalette {
  return {
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyUpper: mixHex(a.skyUpper, b.skyUpper, t),
    skyMid: mixHex(a.skyMid, b.skyMid, t),
    skyLow: mixHex(a.skyLow, b.skyLow, t),
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon, t),
    skyBottom: mixHex(a.skyBottom, b.skyBottom, t),
    sunGlow: mixHex(a.sunGlow, b.sunGlow, t),
    sunCore: mixHex(a.sunCore, b.sunCore, t),
    sunEdge: mixHex(a.sunEdge, b.sunEdge, t),
    sunAlpha: lerp(a.sunAlpha, b.sunAlpha, t),
    starAlpha: lerp(a.starAlpha, b.starAlpha, t),
    cloudAlpha: lerp(a.cloudAlpha, b.cloudAlpha, t),
    aurora: lerp(a.aurora, b.aurora, t),
    birdAlpha: lerp(a.birdAlpha, b.birdAlpha, t),
    farTop: mixHex(a.farTop, b.farTop, t),
    farBottom: mixHex(a.farBottom, b.farBottom, t),
    midTop: mixHex(a.midTop, b.midTop, t),
    midBottom: mixHex(a.midBottom, b.midBottom, t),
    nearTop: mixHex(a.nearTop, b.nearTop, t),
    nearBottom: mixHex(a.nearBottom, b.nearBottom, t),
    crestColor: mixHex(a.crestColor, b.crestColor, t),
    crestAlpha: lerp(a.crestAlpha, b.crestAlpha, t),
    treeColor: mixHex(a.treeColor, b.treeColor, t),
    treeAlpha: lerp(a.treeAlpha, b.treeAlpha, t),
    snowCap: lerp(a.snowCap, b.snowCap, t),
    hazeColor: mixHex(a.hazeColor, b.hazeColor, t),
    hazeAlpha: lerp(a.hazeAlpha, b.hazeAlpha, t),
    groundTop: mixHex(a.groundTop, b.groundTop, t),
    groundUpper: mixHex(a.groundUpper, b.groundUpper, t),
    groundMid: mixHex(a.groundMid, b.groundMid, t),
    groundBottom: mixHex(a.groundBottom, b.groundBottom, t),
    rim: mixHex(a.rim, b.rim, t),
    rimHalo: mixHex(a.rimHalo, b.rimHalo, t),
    rimSoft: mixHex(a.rimSoft, b.rimSoft, t),
    strataColor: mixHex(a.strataColor, b.strataColor, t),
    detailColor: mixHex(a.detailColor, b.detailColor, t),
    rockColor: mixHex(a.rockColor, b.rockColor, t),
    detailStyle: t < 0.5 ? a.detailStyle : b.detailStyle,
    atmosphere: t < 0.5 ? a.atmosphere : b.atmosphere,
    nightFactor: lerp(a.nightFactor, b.nightFactor, t),
  };
}

/* ---------- stage math ---------- */
const STAGE_COUNT = BIOMES.length;

export function globalStageAt(distance: number): number {
  return Math.floor(Math.max(0, distance) / STAGE_LENGTH);
}

export function stageInfoAt(distance: number): StageInfo {
  const globalStage = globalStageAt(distance);
  const index = ((globalStage % STAGE_COUNT) + STAGE_COUNT) % STAGE_COUNT;
  const def = BIOMES[index]!;
  return {
    id: def.id,
    index,
    cycle: Math.floor(globalStage / STAGE_COUNT),
    globalStage,
    stageLabel: `STAGE 0${index + 1}`,
    name: def.name,
    english: def.english,
    hint: def.hint,
    accent: def.accent,
  };
}

/** Blended palette for the car's current distance. */
export function biomePaletteAt(distance: number): BiomePalette {
  const d = Math.max(0, distance);
  const globalStage = globalStageAt(d);
  const index = ((globalStage % STAGE_COUNT) + STAGE_COUNT) % STAGE_COUNT;
  const within = d - globalStage * STAGE_LENGTH;
  const current = BIOMES[index]!.palette;

  // One continuous cross-fade spans 45 m either side of the boundary; at the
  // exact seam both adjacent stages evaluate to t = 0.5.
  if (globalStage > 0 && within < BIOME_TRANSITION) {
    const previousIndex =
      ((globalStage - 1) % STAGE_COUNT + STAGE_COUNT) % STAGE_COUNT;
    const t = smoothstep(
      0,
      BIOME_TRANSITION * 2,
      within + BIOME_TRANSITION,
    );
    return blendPalettes(BIOMES[previousIndex]!.palette, current, t);
  }
  if (within > STAGE_LENGTH - BIOME_TRANSITION) {
    const nextIndex = (globalStage + 1) % STAGE_COUNT;
    const t = smoothstep(
      0,
      BIOME_TRANSITION * 2,
      within - (STAGE_LENGTH - BIOME_TRANSITION),
    );
    return blendPalettes(current, BIOMES[nextIndex]!.palette, t);
  }
  return current;
}

/* ---------- deterministic stage profile ---------- */
interface StageProfile {
  patches: SurfacePatch[];
  vents: UpdraftVent[];
}

const profileCache = new Map<number, StageProfile>();

/** Sample the ridge and return low points (visual valleys) for hazards. */
function valleyCenters(stage: number): number[] {
  const base = START_X + stage * STAGE_LENGTH;
  const samples = 26;
  const step = (STAGE_LENGTH - 40) / (samples - 1);
  const points: { x: number; h: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const x = base + 20 + i * step;
    points.push({ x, h: heightAt(x) });
  }
  const candidates: { x: number; h: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1]!;
    if (p.h >= prev.h && p.h >= next.h) candidates.push(p);
  }
  candidates.sort((a, b) => b.h - a.h);
  const chosen: number[] = [];
  for (const c of candidates) {
    if (chosen.every((x) => Math.abs(x - c.x) > 55)) chosen.push(c.x);
    if (chosen.length >= 3) break;
  }
  if (chosen.length < 2) chosen.push(base + 150, base + 340);
  return chosen;
}

function profileForStage(stage: number): StageProfile {
  const cached = profileCache.get(stage);
  if (cached) return cached;

  const local = ((stage % STAGE_COUNT) + STAGE_COUNT) % STAGE_COUNT;
  const base = START_X + stage * STAGE_LENGTH;
  const profile: StageProfile = { patches: [], vents: [] };

  if (local === 1 || local === 2) {
    const ice = local === 1;
    const rng = mulberry32(((stage + 13) * 0x9e3779b1) >>> 0);
    const count = 3;
    const minLen = ice ? 18 : 14;
    const maxLen = ice ? 32 : 24;
    const valleys = ice ? [] : valleyCenters(stage);
    const slot = STAGE_LENGTH / count;

    for (let i = 0; i < count; i++) {
      const len = minLen + rng() * (maxLen - minLen);
      let start: number;
      if (!ice && valleys[i] !== undefined) {
        start = valleys[i]! - len * 0.5 + (rng() - 0.5) * 24;
      } else {
        start = base + 26 + i * slot + rng() * Math.max(8, slot - len - 52);
      }
      start = clamp(start, base + 20, base + STAGE_LENGTH - len - 20);
      profile.patches.push({
        kind: ice ? "ice" : "mud",
        start,
        end: start + len,
        stage,
      });
    }
  }

  if (local === 3) {
    const rng = mulberry32(((stage + 29) * 0x85ebca6b) >>> 0);
    const valleys = valleyCenters(stage);
    for (let i = 0; i < 2; i++) {
      profile.vents.push({
        x: valleys[i] ?? base + 170 + i * 170,
        width: 8 + rng() * 4,
        phase: rng() * TAU,
      });
    }
  }

  profileCache.set(stage, profile);
  return profile;
}

/** Surface patches visible between two world-X bounds. */
export function visiblePatches(x0: number, x1: number): SurfacePatch[] {
  const first = Math.max(0, Math.floor((x0 - START_X) / STAGE_LENGTH));
  const last = Math.max(0, Math.floor((x1 - START_X) / STAGE_LENGTH));
  const out: SurfacePatch[] = [];
  for (let stage = first; stage <= last; stage++) {
    for (const patch of profileForStage(stage).patches) {
      if (patch.end > x0 && patch.start < x1) out.push(patch);
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** Updraft vents visible between two world-X bounds. */
export function visibleVents(x0: number, x1: number): UpdraftVent[] {
  const first = Math.max(0, Math.floor((x0 - START_X) / STAGE_LENGTH));
  const last = Math.max(0, Math.floor((x1 - START_X) / STAGE_LENGTH));
  const out: UpdraftVent[] = [];
  for (let stage = first; stage <= last; stage++) {
    for (const vent of profileForStage(stage).vents) {
      if (vent.x + vent.width > x0 && vent.x - vent.width < x1) out.push(vent);
    }
  }
  return out;
}

const GROUND_SURFACE: SurfaceState = {
  kind: "ground",
  grip: 1,
  rollingResistance: 0,
  dragMultiplier: 1,
};

/** Grip / drag at a world X, with tyre upgrades clawing back up to 45%. */
export function surfaceAt(x: number, gripFactor: number): SurfaceState {
  const d = x - START_X;
  if (d < 0) return GROUND_SURFACE;
  const stage = Math.floor(d / STAGE_LENGTH);
  const local = ((stage % STAGE_COUNT) + STAGE_COUNT) % STAGE_COUNT;
  if (local !== 1 && local !== 2) return GROUND_SURFACE;

  for (const patch of profileForStage(stage).patches) {
    if (x < patch.start || x > patch.end) continue;
    const base = patch.kind === "ice" ? ICE_GRIP : MUD_GRIP;
    const offset =
      clamp((gripFactor - 1) / 0.63, 0, 1) * TIRE_PENALTY_OFFSET;
    return {
      kind: patch.kind,
      grip: base + (1 - base) * offset,
      rollingResistance: patch.kind === "ice" ? 30 : 480,
      dragMultiplier: patch.kind === "ice" ? 0.9 : 1.65,
    };
  }
  return GROUND_SURFACE;
}

/** 0–1 lift strength when the car is above a night-summit vent. */
export function updraftAt(x: number): number {
  const d = x - START_X;
  if (d < 0) return 0;
  const stage = Math.floor(d / STAGE_LENGTH);
  const local = ((stage % STAGE_COUNT) + STAGE_COUNT) % STAGE_COUNT;
  if (local !== 3) return 0;
  for (const vent of profileForStage(stage).vents) {
    const half = vent.width * 0.5;
    const dist = Math.abs(x - vent.x);
    if (dist >= half) continue;
    const t = 1 - dist / half;
    return t * t * (3 - 2 * t);
  }
  return 0;
}
