---
name: release-and-docs-sync
description: >-
  Use whenever finishing a player-facing feature, bugfix, balance tweak, UI/control change,
  performance update, or when modifying README.md, src/notices.ts, package.json version, or
  index.html#noticeVersion. Enforces SemVer sync, strict README quality standards,
  player-friendly bulletin formatting, and verification via tests/docs-sync.test.ts.
---

# Release, README & Pit Bulletin Synchronization

Follow this runbook before finishing any change that impacts players, documentation, version numbers, or repo structure.

## 1. Decide Whether a Version Bump & Notice Entry Are Required

- **Requires SemVer bump + 4-way sync + new `src/notices.ts` entry**:
  - Gameplay physics, items, biomes, stunts, vehicles, missions, daily/challenge rules, controls/HUD/modals, rendering/perf fixes visible or beneficial to players, bugfixes.
  - **Version increment guide**:
    - **PATCH (`x.y.Z`)**: Bugfixes, edge-case hardening, rendering/power optimizations, subtle input/UI polish without new player-facing progression systems (e.g. `v2.5.1`, `v2.6.1`).
    - **MINOR (`x.Y.0`)**: New features, UI workflows, progression/balance changes, mission tier/biome/item reworks, or notable cross-device UX upgrades (e.g. `v2.6.0`, `v2.7.0`).
    - **MAJOR (`X.0.0`)**: Breaking save schema resets or foundational game overhaul (only with explicit user confirmation).
- **Internal / Docs-Only Changes (NO version bump, NO fake player notice)**:
  - Editing `AGENTS.md`, `.agents/`, internal comments, test-only additions (`tests/*.test.ts`), or purely restructuring `README.md` without changing gameplay/version.
  - Still inspect and update `README.md` directory tree / engineering sections if files or test suites changed, and run `npm test && npm run build`.

---

## 2. Four-Way Version Synchronization Checklist

When bumping version `vX.Y.Z`:

1. `package.json` -> `"version": "X.Y.Z"`
2. `index.html` -> `<small id="noticeVersion">vX.Y.Z</small>`
3. `src/notices.ts` -> New `"update"` entry inserted at `NOTICES[0]` with `id: "update-vX.Y.Z"` and `version: "vX.Y.Z"`
4. `README.md` -> Both the top hero version tag (`<strong>当前版本</strong> <code>vX.Y.Z</code>`) and `## 最新动态 · vX.Y.Z（YYYY-MM-DD）` heading match `vX.Y.Z`

*(When tech stack or headline gameplay changes materially, also remind the user whether GitHub repository About description/topics need syncing.)*

---

## 3. Standard for `src/notices.ts` (山脊公报)

The in-game bulletin appears directly to players in the UI (`NoticeModal.ts`). Keep it scannable, non-technical, and uniform:

1. **Placement & Pinning**:
   - Insert the new entry at **index `0`** of `NOTICES` (so `LATEST_NOTICE_ID` updates automatically and triggers the unread dot once for players).
   - Set `pinned: true` on the new top `"update"` entry and **remove `pinned: true` from all previous `"update"` entries** (do not disturb pinned entries in `"bulletin"`).
2. **Schema & Hard Limits** (enforced by `tests/docs-sync.test.ts`):
   - `id`: `"update-vX.Y.Z"` (globally unique)
   - `category`: `"update"`
   - `version`: `"vX.Y.Z"`
   - `date`: `"YYYY-MM-DD"` (current local date)
   - `title`: Concise Chinese headline (`4–24` chars; summarize the release theme cleanly without fluff)
   - `summary`: `1–2` clear Chinese sentences (`12–100` chars; ideally `<= 75` chars) explaining how the game feels better or what changed for players
   - `items`: **Strictly `3` or `4` items**. Each item must have:
     - `tag` / `tone` strictly paired: `NEW`/`new`, `TUNE`/`tune`, `FIX`/`fix`, or `EVENT`/`event`
     - `text`: Format `"<4–6字主题>：<1–2句玩家可感知结果>"`
3. **Writing Red Lines**:
   - Write in crisp player-facing Simplified Chinese.
   - **Never** include `.ts`/`.css`/`.html` filenames, class/function names, internal caches, or jargon (e.g., never write "`StrataCache` / `detailMix` / `VehicleRenderer`"; write "赛段交界处草木与路面过渡改为平滑渐变").
   - Never compress the release into a single vague sentence (`"优化体验与修复若干bug"` is forbidden), and never dump internal engineering paragraphs.

---

## 4. Standard for `README.md`

`README.md` serves players first, contributors second, and maintainers third. Prevent clutter and drift with these strict rules:

### A. Fixed Section Hierarchy (Do Not Re-Mix Reader Layers)
Keep the top-to-bottom progression clean:
1. **Hero Header**: `./public/icon.svg` emblem (`width="64"`), project title, 1–2 sentence gameplay pitch, live GitHub Pages URL, `vX.Y.Z`, `Node.js 22.18+`, `MIT License`, plus a concise runtime note explaining Vite + TS multi-module static architecture, zero third-party JS runtime deps, Google Fonts with local fallback, and `localStorage` persistence. (Never claim "single-file".)
2. **Core Features (`## 核心特色`)**: 4–5 scannable bullets.
3. **Quick Start (`## 快速开始`)**: Play link -> Controls table -> `npm install / dev / test / build / preview` + `base: "./"` / CI deploy note.
4. **Latest Release (`## 最新动态 · vX.Y.Z（YYYY-MM-DD）`)**: ONLY the current version's 3–5 highlights directly visible. Older versions (`v2.0.0` .. previous) MUST stay collapsed inside `<details><summary>...</summary>...</details>`.
5. **Gameplay Mechanics & Balance (`## 游戏机制与数值规则`)**: Clean tables + short bullets for vehicle/recovery physics, stunts & nitro, 4 biomes + multi-loop `STAGE 05+`, items, garage unlock/upgrades, 3-tier contracts, and camera FOV.
6. **Ghost, Daily Trial, Challenge & Poster (`## 幽灵竞速、每日试炼与战书`)**: Recording/compression, `RR2.`, daily vs standard fairness, `1200×630` PNG poster metadata.
7. **In-Game Bulletin (`## 山脊公报（内建公告系统）`)**: Explains `src/notices.ts` unread indicator, categories, keyboard focus, and maintenance without touching runtime behavior.
8. **Engineering Architecture, Performance & Persistence (`## 工程结构与技术架构`)**: Exact directory tree matching actual files, caching & power optimization summary, `2026-11-16` Chromium controlled benchmark table (`c910728` vs `c888359`), and `ridge-run-v2` save/recovery schema.
9. **Contributing & License (`## 参与贡献与开源协议`)**: Issue/PR flow, `npm test && npm run build` check, pointer to `AGENTS.md` / `.agents/skills/`, and MIT license link.

### B. Formatting & Precision Red Lines
1. **No Run-On Nested-Parenthesis Prose**: Move numeric formulas, cooldowns, and multi-condition rules into compact Markdown tables or short key-value bullets (keep prose sentences crisp, not 150-char nested clauses).
2. **Source-Truth Check Before Writing Any Number or Path**:
   - Inspect live files before writing or editing stats, curves, biome limits, mission targets/rewards, keybindings, or file trees:
     - Vehicle mass/wheels/unlocks & upgrade formulas -> verify `src/constants.ts` verbatim (e.g., linear fuel burn `1 - (L - 1) * 0.04`, `#07` & `#12` are `双轮`, `#88` is `三轴六轮`).
     - Mission tiers/rewards -> verify `src/missions.ts`.
     - Item chunk cadence -> verify `src/items.ts`.
     - Biome surfaces/loops -> verify `src/physics/biomes.ts` & `src/physics/terrain.ts`.
     - Repo file tree -> verify with `find src tests -maxdepth 3 -type f | sort`.
3. **Avoid Brittle Metrics & Broken Assets**:
   - Do **not** embed hardcoded total test counts (`"38 tests passing"`) in `README.md` prose; describe the verified coverage of each `tests/*.test.ts` file instead.
   - Only reference image/SVG paths that actually exist committed in the repo (`./public/icon.svg`, etc.). Never invent placeholder screenshot links.

---

## 5. Verification

Run after all edits are complete:

```sh
npm test && npm run build
```

Verify `tests/docs-sync.test.ts` passes with 0 failures alongside the rest of the suite and TypeScript/Vite build finishes cleanly.
