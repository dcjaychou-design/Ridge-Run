import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAMERA_WIDTH,
  LEGACY_BACKUP_KEY,
  LEGACY_SAVE_KEY,
  MAX_CAMERA_WIDTH,
  MIN_CAMERA_WIDTH,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
} from "../src/constants.ts";
import { dailySeedFor, dailyVehicleFor } from "../src/daily.ts";
import { GhostRecorder } from "../src/ghost/GhostSystem.ts";
import {
  getLastWriteError,
  getSaveReport,
  loadSave,
  onStorageError,
  persistSave,
} from "../src/storage.ts";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  failGet = false;
  failSetKeys = new Set<string>();
  failAllSet = false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    if (this.failGet) throw new Error("SecurityError: storage blocked");
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failAllSet || this.failSetKeys.has(key)) {
      throw new Error("QuotaExceededError");
    }
    this.map.set(key, value);
  }
}

function withMockStorage(storage: Storage | undefined, fn: () => void): void {
  const prevDesc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  try {
    fn();
  } finally {
    if (prevDesc) Object.defineProperty(globalThis, "localStorage", prevDesc);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("migrates v1 save into v2 with stock garage and career progress preserved", () => {
  const store = new MemoryStorage();
  store.setItem(LEGACY_SAVE_KEY, JSON.stringify({ best: 642, coins: 310, muted: true }));

  withMockStorage(store, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(save.best, 642);
    assert.equal(save.coins, 310);
    assert.equal(save.muted, true);
    assert.equal(save.selectedVehicle, "rally");
    assert.deepEqual(save.unlockedVehicles, ["rally"]);
    assert.equal(save.cameraWidth, DEFAULT_CAMERA_WIDTH);
    assert.equal(report.writeFailed, false);
    assert.ok(store.getItem(SAVE_KEY) !== null);
  });
});

test("normalizes invalid fields including out-of-range cameraWidth into repairedFields", () => {
  const store = new MemoryStorage();
  store.setItem(
    SAVE_KEY,
    JSON.stringify({
      best: -10,
      coins: "NaN",
      cameraWidth: 99,
      selectedVehicle: "truck", // not unlocked
      unlockedVehicles: ["rally", "submarine"],
      upgrades: { rally: { engine: 99, tires: -2 } },
      lastSeenNoticeId: 123,
    }),
  );

  withMockStorage(store, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(save.best, 0);
    assert.equal(save.coins, 0);
    assert.equal(save.cameraWidth, MAX_CAMERA_WIDTH);
    assert.equal(save.selectedVehicle, "rally");
    assert.deepEqual(save.unlockedVehicles, ["rally"]);
    assert.equal(save.upgrades.rally.engine, 10);
    assert.equal(save.upgrades.rally.tires, 1);
    assert.equal(save.lastSeenNoticeId, "");
    assert.ok(report.repairedFields.includes("best"));
    assert.ok(report.repairedFields.includes("coins"));
    assert.ok(report.repairedFields.includes("cameraWidth"));
    assert.ok(report.repairedFields.includes("selectedVehicle"));
    assert.ok(report.repairedFields.includes("unlockedVehicles"));

    // Below min threshold also gets flagged & clamped
    store.setItem(SAVE_KEY, JSON.stringify({ cameraWidth: MIN_CAMERA_WIDTH - 10 }));
    const lowSave = loadSave();
    assert.equal(lowSave.cameraWidth, MIN_CAMERA_WIDTH);
    assert.ok(getSaveReport().repairedFields.includes("cameraWidth"));
  });
});

test("backs up corrupt JSON save and locks read-only memory session if backup fails", () => {
  const store = new MemoryStorage();
  const badPayload = "{broken-json";
  store.setItem(SAVE_KEY, badPayload);

  withMockStorage(store, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(report.corruptRecovered, true);
    assert.equal(report.backupSaved, true);
    assert.equal(report.preserveRawPrimary, false);
    assert.equal(store.getItem(SAVE_BACKUP_KEY), badPayload);
    save.coins = 55;
    persistSave(save, true);
    assert.ok(JSON.parse(store.getItem(SAVE_KEY)!).coins === 55);
  });

  // When backup write fails, raw primary must NOT be overwritten
  const lockedStore = new MemoryStorage();
  lockedStore.setItem(SAVE_KEY, badPayload);
  lockedStore.failSetKeys.add(SAVE_BACKUP_KEY);

  withMockStorage(lockedStore, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(report.corruptRecovered, true);
    assert.equal(report.backupSaved, false);
    assert.equal(report.preserveRawPrimary, true);
    assert.equal(report.writeFailed, true);
    assert.equal(getLastWriteError(), "backup-write-failed");
    save.coins = 999;
    persistSave(save, true);
    assert.equal(lockedStore.getItem(SAVE_KEY), badPayload);
  });

  // Corrupt legacy v1 save backup
  const legacyBadStore = new MemoryStorage();
  legacyBadStore.setItem(LEGACY_SAVE_KEY, "{not-json");
  withMockStorage(legacyBadStore, () => {
    loadSave();
    assert.equal(legacyBadStore.getItem(LEGACY_BACKUP_KEY), "{not-json");
    assert.equal(getSaveReport().corruptRecovered, true);
  });
});

test("protects blocked reads and notifies listener on runtime write failure", () => {
  const blocked = new MemoryStorage();
  blocked.failGet = true;

  withMockStorage(blocked, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(report.storageReadBlocked, true);
    assert.equal(report.preserveRawPrimary, true);
    save.coins = 10;
    persistSave(save, true); // stays read-only, does not throw or touch storage
    assert.equal(save.coins, 10);
  });

  const full = new MemoryStorage();
  withMockStorage(full, () => {
    const save = loadSave();
    let errorCount = 0;
    const unsub = onStorageError((kind) => {
      if (kind === "write-failed") errorCount++;
    });
    full.failAllSet = true;
    save.coins = 100;
    persistSave(save, true);
    unsub();
    assert.equal(errorCount, 1);
    assert.equal(getSaveReport().writeFailed, true);
    assert.equal(getLastWriteError(), "QuotaExceededError");
  });
});

test("rejects stale ghosts whose distance exceeds saved best or dailyBest", () => {
  const buildGhost = (
    mode: "standard" | "daily",
    seed: number,
    vehicleId: "rally" | "moto" | "truck",
    distance: number,
    dateKey?: string,
  ) => {
    const rec = new GhostRecorder();
    rec.reset({ mode, seed, dateKey, vehicleId });
    for (let i = 0; i <= 10; i++) {
      rec.tick(0.15, 6 + (distance * i) / 10, 0, 0);
    }
    return rec.finish(distance, 6 + distance, 0, 0)!;
  };

  const dailyDate = "2026-11-18";
  const dailySeed = dailySeedFor(dailyDate);
  const dailyVehicle = dailyVehicleFor(dailySeed);

  const inconsistent = new MemoryStorage();
  inconsistent.setItem(
    SAVE_KEY,
    JSON.stringify({
      best: 300,
      bestGhost: buildGhost("standard", 0, "rally", 520),
      dailyDate,
      dailyBest: 200,
      dailyGhost: buildGhost("daily", dailySeed, dailyVehicle, 480, dailyDate),
    }),
  );

  withMockStorage(inconsistent, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(save.bestGhost, null);
    assert.equal(save.dailyGhost, null);
    assert.ok(report.repairedFields.includes("bestGhost"));
    assert.ok(report.repairedFields.includes("dailyGhost"));
  });

  const consistent = new MemoryStorage();
  consistent.setItem(
    SAVE_KEY,
    JSON.stringify({
      best: 520,
      bestGhost: buildGhost("standard", 0, "rally", 520),
      dailyDate,
      dailyBest: 480,
      dailyGhost: buildGhost("daily", dailySeed, dailyVehicle, 480, dailyDate),
    }),
  );

  withMockStorage(consistent, () => {
    const save = loadSave();
    const report = getSaveReport();
    assert.equal(save.bestGhost?.distance, 520);
    assert.equal(save.dailyGhost?.distance, 480);
    assert.equal(report.repairedFields.length, 0);
  });
});
