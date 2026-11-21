# AGENTS.md — Repository Engineering & Agent Contract

This file defines mandatory workspace rules for **Ridge Run (`山脊冲刺`)**. All AI coding agents (Antigravity, Codex, Claude Code, Cursor, Gemini CLI, Copilot, OpenCode, etc.) and automated contributors must follow these rules in every session.

## 1. Project Identity & Invariants

- **Stack**: Modular Vite + strict TypeScript frontend game using procedural Canvas 2D rendering and synthesized Web Audio API. Production builds (`dist/`) deploy statically with `base: "./"` and **zero third-party JS runtime dependencies**. (HTML loads Google Fonts stylesheets with local system font fallback when offline or blocked.)
- **Persistence**: All progress lives locally in browser `localStorage` under `ridge-run-v2` (with legacy `ridge-run-v1` migration and `ridge-run-v2-backup` / `ridge-run-v1-backup` safety backups).
- **Single Sources of Truth**:
  - Physics constants, vehicle geometry/stats, upgrade curves, stunt parameters, and ghost/bounty limits live in `src/constants.ts`. Do not duplicate formulas or specs in UI/docs without verifying against `src/constants.ts`.
  - **Do NOT delete or strip `src/notices.ts`**: the built-in in-game bulletin ("山脊公报") is a core runtime feature rendered on the home screen (`NoticeModal.ts`), separate from `README.md`.
  - Release version identity must stay synchronized across `package.json`, `index.html` (`#noticeVersion`), `src/notices.ts` (top `"update"` entry), and `README.md`.

## 2. Pre-Implementation Engineering Review (Do Not Blindly Execute Suboptimal Prompts)

Never blindly translate a user prompt into code without evaluating root cause, side effects, and architectural quality:

1. **Challenge Flawed Premises Before Editing**:
   - Inspect the live codebase first. If the requested fix only papers over a symptom, breaks an invariant (determinism, daily fairness, `RR2.` wire compatibility, responsive layouts, offline/backup safety, power throttling), or misses a clearly simpler/cleaner architecture, **pause before writing code**.
   - Present a concise engineering assessment comparing the requested approach against your recommended alternative (with concrete trade-offs and affected files), and wait for user alignment.
2. **Surface Adjacent Gaps Constructively**:
   - If analysis reveals closely coupled bugs or missing safeguards in the touched flow, report them clearly rather than silently ignoring them or making unrequested scope leaps.
3. **Clarify Real Ambiguity**:
   - When requirements leave open product choices (balance numbers, UX placement, destructive vs reversible behavior), ask targeted clarifying questions before implementing.

## 3. Read-Before-Edit & Source-Truth Verification

- Never modify modules from memory. Before editing any subsystem, read the target file(s), its callers, and its corresponding test suite(s):

| Subsystem | Core Modules to Inspect | Associated Tests |
| --- | --- | --- |
| Physics & Camera | `src/constants.ts`, `src/physics/VehiclePhysics.ts`, `src/physics/terrain.ts`, `src/camera.ts` | `tests/physics-camera.test.ts` |
| Biomes, Items & Loops | `src/physics/biomes.ts`, `src/items.ts`, `src/constants.ts` | `tests/items-biomes.test.ts` |
| Ghost, Daily & Challenges | `src/ghost/GhostSystem.ts`, `src/daily.ts`, `src/ui/ChallengeController.ts`, `src/ui/PosterGenerator.ts` | `tests/ghost.test.ts`, `tests/daily-missions.test.ts` |
| Contracts / Missions | `src/missions.ts`, `src/ui/MissionBoard.ts` | `tests/daily-missions.test.ts`, `tests/ui-performance.test.ts` |
| Persistence & Recovery | `src/storage.ts`, `src/daily.ts` | `tests/storage.test.ts` |
| Rendering, Cache & Loop | `src/main.ts`, `src/render/*.ts`, `src/audio/AudioController.ts` | `tests/render-cache.test.ts`, `tests/strata-cache.test.ts`, `tests/showcase.test.ts` |
| HUD, Modals & Responsive CSS | `index.html`, `src/style.css`, `src/polish.css`, `src/ui/*.ts` | `tests/ui-performance.test.ts` |
| Releases, Notices & Docs | `package.json`, `index.html`, `src/notices.ts`, `README.md` | `tests/docs-sync.test.ts` |

- **Evidence-Based Reporting**: Only cite file paths, symbols, constants, formulas, or command outputs you directly inspected in the current session. Only claim tests/builds pass if executed **after your final edit** with zero failures or skipped assertions.
- **Keep Helpers Shared**: Reuse existing helpers in `src/utils.ts` (`clamp`, `lerp`, `mixHex`, `quantizeHex`, `withAlpha`, `roundRect`) and existing UI/rendering patterns rather than duplicating utilities.
- **No Unapproved Runtime Dependencies**: Keep zero runtime npm dependencies unless explicitly requested.

## 4. Mandatory Skill Workflows (Execute By Task Type)

Agents that natively discover `.agents/skills/` should activate the matching skill; all other Agents **must read the referenced `SKILL.md` file explicitly** before acting:

1. **Before editing code** in physics, rendering/caches, ghosts, daily/challenge modes, persistence, audio, or HUD/modals:
   - Read and follow **[`.agents/skills/subsystem-invariants/SKILL.md`](./.agents/skills/subsystem-invariants/SKILL.md)**.
2. **Before concluding any player-facing change, bugfix, balance tweak, UI update, version bump, or `README.md` / `src/notices.ts` edit**:
   - Read and execute **[`.agents/skills/release-and-docs-sync/SKILL.md`](./.agents/skills/release-and-docs-sync/SKILL.md)**.

## 5. Verification, Reporting & Git Discipline

1. **Mandatory Verification Gate**: Always run after final edits:
   ```sh
   npm test && npm run build
   ```
   Add or update deterministic tests in `tests/*.test.ts` for behavioral changes, bugfixes, balance adjustments, serialization changes, and doc/notice synchronization.
2. **Default Stop-and-Report Workflow**:
   - **NEVER run `git commit`, `git push`, `gh repo edit`, or create tags autonomously** unless the user **explicitly asks in the current turn** to commit/push or update remote repository metadata.
   - Leave completed, verified changes cleanly in the working tree, then report:
     1. Modified/created files with clickable paths and concise explanations;
     2. Exact test and build verification results (`npm test`, `npm run build`);
     3. Proposed English commit message and confirmation prompt before touching Git history or remotes.
