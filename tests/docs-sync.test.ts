import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LATEST_NOTICE_ID, NOTICES } from "../src/notices.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

test("package.json, index.html, notices.ts, and README.md stay synchronized on the same SemVer release", () => {
  const pkg = JSON.parse(readText("package.json")) as { version: string };
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const expectedTag = `v${pkg.version}`;

  const html = readText("index.html");
  const htmlMatch = html.match(/id="noticeVersion"[^>]*>(v\d+\.\d+\.\d+)<\/small>/);
  assert.ok(htmlMatch, "index.html must expose #noticeVersion as vX.Y.Z");
  assert.equal(htmlMatch[1], expectedTag, "index.html #noticeVersion must match package.json");

  const readme = readText("README.md");
  const heroVersion = readme.match(/<strong>当前版本<\/strong>\s*<code>(v\d+\.\d+\.\d+)<\/code>/);
  assert.ok(heroVersion, "README.md hero bar must display current version");
  assert.equal(heroVersion[1], expectedTag, "README.md hero version must match package.json");

  const latestSection = readme.match(/^## 最新动态 · (v\d+\.\d+\.\d+)（\d{4}-\d{2}-\d{2}）/m);
  assert.ok(latestSection, "README.md must keep a latest highlights section matching ## 最新动态 · vX.Y.Z（YYYY-MM-DD）");
  assert.equal(latestSection[1], expectedTag, "README.md latest release heading must match package.json");

  const topNotice = NOTICES[0];
  assert.ok(topNotice, "NOTICES must not be empty");
  assert.equal(LATEST_NOTICE_ID, topNotice.id);
  assert.equal(topNotice.category, "update");
  assert.equal(topNotice.version, expectedTag, "Top notice entry must match package.json version");
  assert.equal(topNotice.id, `update-${expectedTag}`, "Top notice id must follow update-vX.Y.Z");
});

test("src/notices.ts maintains clean player-facing structure and single pinned release", () => {
  const seenIds = new Set<string>();
  const pinnedUpdates = NOTICES.filter((entry) => entry.category === "update" && entry.pinned);
  assert.equal(pinnedUpdates.length, 1, "Exactly one update notice (the latest) should be pinned");
  assert.equal(pinnedUpdates[0]!.id, NOTICES[0]!.id);

  for (const entry of NOTICES) {
    assert.ok(entry.id.trim().length > 0);
    assert.equal(seenIds.has(entry.id), false, `Duplicate notice id: ${entry.id}`);
    seenIds.add(entry.id);
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.title.trim().length >= 4, `Notice ${entry.id} title is too short`);
    assert.ok(entry.summary.trim().length >= 10, `Notice ${entry.id} summary is too short`);
    assert.ok(entry.items.length >= 2, `Notice ${entry.id} must list structured bullet items`);
    for (const item of entry.items) {
      assert.ok(["new", "tune", "fix", "event"].includes(item.tone), `Invalid tone on ${entry.id}`);
      assert.equal(item.tag, item.tone.toUpperCase(), `Tag/tone mismatch on ${entry.id}`);
      assert.ok(item.text.trim().length >= 8);
    }
  }

  const latest = NOTICES[0]!;
  assert.ok(latest.title.length <= 24, `Latest update title too long (${latest.title.length} > 24)`);
  assert.ok(latest.summary.length <= 100, `Latest update summary too long (${latest.summary.length} > 100)`);
  assert.ok(latest.items.length >= 3 && latest.items.length <= 4, "Latest release notice must keep 3-4 scannable items");
  for (const item of latest.items) {
    assert.equal(
      /\.(?:ts|css|html)\b|\/src\//i.test(item.text),
      false,
      `Latest player notice item must avoid raw code file paths: ${item.text}`,
    );
  }
});

test("README.md directory tree and agent guidance paths exist on disk", () => {
  const readme = readText("README.md");
  const requiredAnchors = [
    "AGENTS.md",
    "CLAUDE.md",
    ".agents/skills/release-and-docs-sync/SKILL.md",
    ".agents/skills/subsystem-invariants/SKILL.md",
    "public/icon.svg",
    "public/manifest.webmanifest",
    "src/notices.ts",
    "src/constants.ts",
    "tests/docs-sync.test.ts",
  ];
  for (const rel of requiredAnchors) {
    assert.equal(existsSync(path.join(ROOT, rel)), true, `Missing required file: ${rel}`);
  }

  const treeBlock = readme.match(/```text\n([\s\S]*?)```/);
  assert.ok(treeBlock, "README.md must include an engineering directory tree");
  const baseNames = treeBlock[1]!
    .split("\n")
    .flatMap((line) => line.replace(/#.*/, "").replace(/^[\s│├└─]+/, "").trim().split(/\s+\/\s+/))
    .filter((entry) => /\.(?:ts|css|html|json|md|mjs|svg|webmanifest)$/.test(entry));

  assert.ok(baseNames.includes("AGENTS.md"));
  assert.ok(baseNames.includes("CLAUDE.md"));
  assert.ok(baseNames.includes("docs-sync.test.ts"));
});
