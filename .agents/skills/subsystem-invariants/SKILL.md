---
name: subsystem-invariants
description: >-
  Use before implementing code changes in Ridge Run across vehicle physics, terrain/biomes,
  item pacing, ghost codecs, daily/challenge modes, storage recovery, audio, Canvas rendering/caching,
  or HUD/modals. Prevents cross-module regressions by enumerating hidden coupling and invariants.
---

# Ridge Run Subsystem Invariants

Read the relevant section(s) below **before writing code** whenever modifying runtime behavior.

## 1. Vehicle Physics, Collision & Camera (`src/physics/`, `src/camera.ts`, `src/main.ts`)

- **Fixed-Step Deterministic Solver**: Physics advances at `GOAL_STEP = 1 / 120` in `main.ts` (`while` accumulator capped at 6 steps). Keep force/torque integrations `dt`-scaled and state transitions guarded against `dt === 0` or variable frame rates.
- **Rendered Silhouette Must Match Collision Probes**: `chassisPoints` and `roofPoints` in `src/constants.ts` map directly to local vehicle coordinates drawn by `VehicleRenderer.ts`. Whenever editing bodywork geometry or crash thresholds, verify both chassis/roof probe coordinates and ground clearance parity.
- **Wheel-Shared Resistance & Empty Fuel Cutoffs**:
  - Rolling/braking resistance on multi-axle vehicles (`truck` has 3 axles) uses per-wheel shares (`wheelShares`) and shared drivetrain drag — never multiply coasting drag blindly per wheel.
  - Empty fuel (`fuel <= 0`) must disable throttle, reverse torque, nitro cruise thrust, and active engine revving (`canDrive = fuel > 0 && !car.crashed`).
- **Soft-Lock Protection**: Keep `STUCK_RECOVER_TIME` (grounded throttle stall -> `-RESPAWN_FUEL_COST`) and `TIPPED_SETTLE_TIME` -> `physics.forceCrash()` working for high-roll resting states.
- **Showcase Isolation & Camera Linearity**:
  - `HomeShowcase` owns a separate `VehiclePhysics` rig for intro parking; starting a run must never inherit intro pose offsets.
  - Keep `baseScale = viewportWidth / cameraWidth` linear across viewports (`camera.ts`), with real-time effective FOV displayed on HUD.

## 2. Biomes, Terrain, Items & Progression (`src/physics/terrain.ts`, `src/physics/biomes.ts`, `src/items.ts`, `src/missions.ts`)

- **Seed Determinism**:
  - `seed = 0` is reserved strictly for the standard mode ridge (`terrain.ts` skips seed phase/frequency jitter when `0`; `dailySeedFor` returns non-zero `uint32`).
  - `generateChunkItems` (`items.ts`) and `profileForStage` (`biomes.ts`) must depend strictly on seeded `mulberry32` + world coordinates (`onWorldSeedChange` invalidates stage hazard caches and `StrataCache`).
- **Item Placement Spacing**:
  - Fuel spawns on evenly spaced even chunks (`chunk >= 2 && chunk % 4 === 2`), decoupled from odd-chunk coin arcs (`chunk % 2 === 1`).
  - Keep non-coin pickups (`fuel`, `magnet`, `nitro`) strictly separated from each other (`> 5.5m`) and clear of coin arcs via `isClear(...)`.
- **Smooth Biome Boundaries**:
  - Never branch visual surface/track geometry discretely on `p.detailStyle` or `p.atmosphere` midpoints. Use continuously interpolated `p.detailMix` (`pine`, `snow`, `rock`, `aurora`), `p.snowCap`, `p.treeAlpha`, and `p.aurora`.
  - Multi-loop (`2000m+`, `cycle >= 1`) stages keep continuous global `stageLabel` (`STAGE 05+`) and loop callouts while keeping `STAGE 01–04` unchanged for loop `0`.
- **Missions**: All 6 `MissionKind`s (`distance`, `flips`, `perfect`, `coins`, `wheelie`, `stage`) must maintain strictly ascending 3-tier `targets` and `rewards`. Settle completed contracts consistently on run end AND restart/home reset.

## 3. Ghost Replay, Daily Trial, Challenge Fairness & Poster (`src/ghost/`, `src/daily.ts`, `src/ui/ChallengeController.ts`, `src/ui/PosterGenerator.ts`)

- **Replay & Codec Backwards Compatibility**:
  - Preserve decoding of legacy `RR2.` `v1` and `v2` codes alongside `v3` (`durationMs` tail timing).
  - Compacting past `GHOST_MAX_FRAMES` (1200) doubles `stride` while preserving time alignment (`since`) and exact finish coordinates (`GHOST_MAX_FRAMES`, `GHOST_SHARE_MAX_FRAMES = 240`).
  - Validate decoded and loaded ghosts via `sanitizeGhostRecord` (`isValidGhostPayload` velocity envelope, `MAX_GHOST_DISTANCE`, daily seed/vehicle consistency).
- **Competition & Tie Fairness**:
  - In-run overtake (`GHOST_MIN_OVERTAKE = 80`) and final win (`finalDistance > rival.distance`) must both compare floored whole metres consistently (`Math.floor(distance)`). Equal metres are ties, not wins.
  - Daily trials & daily challenges lock the seeded official vehicle (`dailyVehicleFor`) and uniform `Lv.5` (`DAILY_FAIR_LEVEL`) upgrades regardless of player unlocks.
  - Standard challenges allow the challenger's own garage rig/upgrades and synchronize new `save.best` + `save.bestGhost` when breaking standard PB.
  - Across UTC midnight rollovers during an active daily run, settle coins/result on the pre-rollover board cleanly and transition on next home/reload/restart.
- **Tactical Poster (`PosterGenerator.ts`)**: Keep `1200×630` layout, `embedChallengeInPng` / `extractChallengeFromPng` (`tEXt` keyword `ridge-run-challenge`) round-trip lossless, and remember Canvas Y-down orientation (`heightAt` increases downward).

## 4. Canvas Rendering, Caching & Power Budget (`src/render/*.ts`, `src/audio/AudioController.ts`, `src/main.ts`)

- **Offscreen Cache Hygiene**:
  - Quantize smoothly fading hex colors (`quantizeHex` in `src/utils.ts`) for cached rasters (`MountainRenderer` layers, `SkyRenderer.cloudCache`).
  - Clear and reuse same-sized offscreen canvases (`clearRect` + reset `globalCompositeOperation = "source-over"`) rather than reassigning `canvas.width`/`height` every rebuild.
  - Keep `MountainRenderer` 4-layer turn-taking refreshes, 4M-pixel cap, `StrataCache` 8m tiles / 24-tile LRU, and `SkyRenderer` 20Hz aurora budget intact.
  - Any offscreen sprite containing text/webfonts (`ItemRenderer`, `VehicleRenderer.bodySprites`) must register a `document.fonts.ready` invalidation hook. Animate moving parts (e.g. `drawMotoAntenna`) live rather than baking them into static body sprites.
- **Ghost HUD / Radar Handoff**: `VehicleRenderer.drawGhost` and `JumpFxRenderer.drawGhostRadar` must agree on screen-edge offscreen thresholds (`offscreen`) so partial ghost hulls + nameplates never collide with `◀ / ▶ / ▲ / ▼` edge radar capsules, and vertical off-screen ghosts always trigger radar.
- **Low-Power Loop & Audio Hygiene**:
  - Drive visual animations with `sceneTime` in `main.ts` so `paused` freezes particles, grass, clouds, and trails in place without advancing/expiring them behind the pause screen.
  - Gate active play overlays (`drawAura`, `drawMagnetAura`, `drawFlash`, `drawCallout`) so expired buffs never pulse on `intro` or `over`.
  - Stop continuous `rAF` canvas repaints and mute/suspend `AudioContext` (`setBackgrounded(true)`, zero `engineGain` target `0`) when `document.hidden`, while modal backdrops cover the canvas, when paused, once `over` settles, or under `prefers-reduced-motion: reduce`; wake immediately via `requestSceneRefresh()` and `onOverlayStackChange`.

## 5. HUD, Modals, Input & Storage Fault Tolerance (`src/ui/`, `src/storage.ts`, `src/style.css`, `src/polish.css`)

- **DOM Churn Prevention**: Preserve snapshot dirty-checking in `HudController` and visibility-gated DOM writes in `MissionBoard`.
- **HUD Focus & Multi-Touch Safety**: Blur top-right HUD tool buttons on click; guard touch pedals per `pointerId` (`lostpointercapture` / `pointercancel` / `blur`) and suppress `contextmenu` on canvas/pedals. Do not hijack keyboard focus inside form controls (`INPUT`, `TEXTAREA`, `SELECT`, `contentEditable`). Keep restart confirmation (`1.4s` double-tap `R`) active only in `playing`.
- **Toast Hierarchy & Safe Area**: Keep `high > normal > low` toast priority rules and avoid placing in-run toast banners over center gameplay silhouettes or stage chips on short/landscape screens; display mission boards across portrait/landscape/laptop viewports properly.
- **Storage Hardening**: `loadSave()` / `persistSave()` in `src/storage.ts` must preserve raw primary payload in read-only memory mode whenever storage read is blocked OR corrupt-backup write fails; clamp invalid fields into `repairedFields` and reject stale ghosts (`bestGhost.distance > save.best`, `dailyGhost.distance > save.dailyBest`).
