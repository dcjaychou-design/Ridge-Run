import test from "node:test";
import assert from "node:assert/strict";
import { HudController } from "../src/ui/HudController.ts";
import { MissionBoard } from "../src/ui/MissionBoard.ts";
import type { HudSnapshot, MissionState } from "../src/types.ts";

function fakeDom() {
  let writes = 0;
  const nodes = new Map<string, ReturnType<typeof node>>();
  function node() {
    const classes = new Set<string>();
    let hidden = false, html = "", text = "";
    const style = new Proxy({} as Record<string, unknown>, {
      set(target, key: string, value) { writes++; target[key] = value; return true; },
      get(target, key: string) { return key === "setProperty" ? () => { writes++; } : target[key]; },
    });
    return {
      offscreen: false,
      style,
      classList: {
        toggle(name: string, on: boolean) {
          if (classes.has(name) !== on) { writes++; on ? classes.add(name) : classes.delete(name); }
        },
        add(name: string) { this.toggle(name, true); },
        remove(name: string) { this.toggle(name, false); },
      },
      get hidden() { return hidden; }, set hidden(value) { writes++; hidden = value; },
      get innerHTML() { return html; }, set innerHTML(value) { writes++; html = value; },
      get textContent() { return text; }, set textContent(value) { writes++; text = value; },
      setAttribute() { writes++; },
      closest() { return this.offscreen ? this : null; },
    };
  }
  const old = globalThis.document;
  globalThis.document = { getElementById(id: string) {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  } } as unknown as Document;
  return { nodes, get writes() { return writes; }, reset() { writes = 0; }, restore() { globalThis.document = old; } };
}

test("unchanged HUD snapshots do not invalidate DOM styles every frame", () => {
  const dom = fakeDom();
  try {
    const hud = new HudController();
    const snapshot: HudSnapshot = {
      distance: 10, best: 50, coins: 2, runCoins: 0, fuel: 50, fuelCapacity: 100,
      speed: 12, playing: true, crashed: false,
      stageLabel: "STAGE 01", stageName: "晨雾松林", stageAccent: "#f0b15e",
      nitro: 0, magnet: 0, combo: 0, cameraWidth: 36, baseCameraWidth: 36,
    };
    hud.update(snapshot, true);
    dom.reset();
    for (let frame = 0; frame < 120; frame++) hud.update(snapshot);
    assert.equal(dom.writes, 0, "a stable HUD should leave the DOM untouched");
    hud.update({ ...snapshot, nitro: 1.8, magnet: 2.4, combo: 2, fuel: 10, speed: 20 });
    assert.ok(dom.writes > 0, "power-up, fuel and speed changes must still be displayed");
    assert.equal(dom.nodes.get("nitroBuff")!.hidden, false);
    assert.equal(dom.nodes.get("magnetBuff")!.hidden, false);
    assert.equal(dom.nodes.get("fuelValue")!.textContent, "10%");
  } finally { dom.restore(); }
});

test("hidden mission panels defer markup work and catch up when shown", () => {
  const dom = fakeDom();
  try {
    const board = new MissionBoard();
    for (const node of dom.nodes.values()) node.offscreen = true;
    const missions: MissionState[] = [{ id: "distance-100", kind: "distance", target: 100, reward: 25, progress: 1, done: false }];
    for (let tick = 1; tick <= 20; tick++) { missions[0]!.progress = tick; board.sync(missions); }
    assert.equal(dom.writes, 0, "driving must not rebuild three invisible mission lists");
    const pause = dom.nodes.get("pauseMissionList")!;
    pause.offscreen = false;
    board.sync(missions);
    assert.match(pause.innerHTML, /20 \/ 100/);
    assert.equal(dom.nodes.get("missionBoardList")!.innerHTML, "");
    board.sync(missions, true);
    assert.match(dom.nodes.get("resultMissionList")!.innerHTML, /20 \/ 100/);
  } finally { dom.restore(); }
});

test("toast priority prevents low-priority alerts from clobbering critical notices", () => {
  const dom = fakeDom();
  const oldWindow = globalThis.window;
  globalThis.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  } as unknown as Window & typeof globalThis;
  try {
    const hud = new HudController();
    hud.showToast("燃油告急", "寻找下一个红色油桶", "high");
    assert.equal(dom.nodes.get("toastMain")!.textContent, "燃油告急");

    // Routine low/normal toasts must not replace an active high-priority warning
    hud.showToast("腾空", "稳住车身", "low");
    assert.equal(dom.nodes.get("toastMain")!.textContent, "燃油告急");
    hud.showToast("涡轮充能", "NITRO 2.2s", "normal");
    assert.equal(dom.nodes.get("toastMain")!.textContent, "燃油告急");

    // Once cleared, lower-priority toasts work normally again
    hud.hideToast();
    hud.showToast("腾空", "稳住车身", "low");
    assert.equal(dom.nodes.get("toastMain")!.textContent, "腾空");
    hud.hideToast();
  } finally {
    globalThis.window = oldWindow;
    dom.restore();
  }
});
