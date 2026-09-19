import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalvePushConfig, UpdateInfo } from "./types";

const mocks = vi.hoisted(() => ({
  installUpdate: vi.fn(),
  notifyAppReady: vi.fn(),
  getCurrentReleaseId: vi.fn(),
  fetchLatestUpdate: vi.fn(),
  downloadAndVerifyBundle: vi.fn(),
}));

// The real module calls NitroModules.createHybridObject() at import time, which has no native
// binding under vitest's Node environment - mock it out entirely so SalvePush.ts never touches it.
vi.mock("./native/salvePushNative", () => ({
  salvePushNative: {
    installUpdate: mocks.installUpdate,
    notifyAppReady: mocks.notifyAppReady,
    getCurrentReleaseId: mocks.getCurrentReleaseId,
  },
}));

// Network/crypto behavior is already covered by update.test.ts; mock it here so these tests
// exercise only SalvePush's own orchestration (config gating, download->install state machine, sync).
vi.mock("./update", () => ({
  fetchLatestUpdate: mocks.fetchLatestUpdate,
  downloadAndVerifyBundle: mocks.downloadAndVerifyBundle,
}));

const config: SalvePushConfig = {
  serverUrl: "https://ota.example.com",
  channel: "production",
  runtimeVersion: "1.5",
  platform: "ios",
  signingPublicKey: "pub",
};

const update: UpdateInfo = {
  id: "release-1",
  version: "1.0.1",
  platform: "ios",
  channel: "production",
  runtimeVersion: "1.5",
  bundleHash: "hash",
  signature: "sig",
  size: 42,
};

// Dynamic import intentional: resets SalvePush.ts's module-level singleton state (config,
// verifiedBundle) between tests by forcing a fresh module instance after vi.resetModules().
/** Fresh module instance per test: SalvePush.ts keeps config/download state in module-level variables. */
async function freshSalvePush() {
  vi.resetModules();
  const mod = await import("./SalvePush");
  return mod.SalvePush;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SalvePush", () => {
  it("throws if checkForUpdate is called before configure", async () => {
    const SalvePush = await freshSalvePush();
    await expect(SalvePush.checkForUpdate()).rejects.toThrow(/configure/);
  });

  it("throws if downloadUpdate is called before configure", async () => {
    const SalvePush = await freshSalvePush();
    await expect(SalvePush.downloadUpdate(update)).rejects.toThrow(/configure/);
  });

  it("throws if installUpdate is called without a prior downloadUpdate", async () => {
    const SalvePush = await freshSalvePush();
    SalvePush.configure(config);
    await expect(SalvePush.installUpdate()).rejects.toThrow(/downloadUpdate/);
  });

  it("passes the downloaded bundle bytes to the native installUpdate call", async () => {
    const SalvePush = await freshSalvePush();
    const bytes = new Uint8Array([1, 2, 3]);
    mocks.downloadAndVerifyBundle.mockResolvedValue(bytes);
    SalvePush.configure(config);

    await SalvePush.downloadUpdate(update);
    await SalvePush.installUpdate();

    expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
    const [releaseId, buffer] = mocks.installUpdate.mock.calls[0]!;
    expect(releaseId).toBe(update.id);
    expect(new Uint8Array(buffer as ArrayBuffer)).toEqual(bytes);
  });

  it("clears the downloaded bundle after a successful install, requiring a fresh download to install again", async () => {
    const SalvePush = await freshSalvePush();
    mocks.downloadAndVerifyBundle.mockResolvedValue(new Uint8Array([9]));
    SalvePush.configure(config);

    await SalvePush.downloadUpdate(update);
    await SalvePush.installUpdate();

    await expect(SalvePush.installUpdate()).rejects.toThrow(/downloadUpdate/);
  });

  it("sync() does nothing when there is no available update", async () => {
    const SalvePush = await freshSalvePush();
    mocks.fetchLatestUpdate.mockResolvedValue(null);
    SalvePush.configure(config);

    await SalvePush.sync();

    expect(mocks.downloadAndVerifyBundle).not.toHaveBeenCalled();
    expect(mocks.installUpdate).not.toHaveBeenCalled();
  });

  it("sync() downloads and installs the latest update end to end", async () => {
    const SalvePush = await freshSalvePush();
    mocks.fetchLatestUpdate.mockResolvedValue(update);
    mocks.downloadAndVerifyBundle.mockResolvedValue(new Uint8Array([7, 7]));
    SalvePush.configure(config);

    await SalvePush.sync();

    expect(mocks.downloadAndVerifyBundle).toHaveBeenCalledWith(config, update);
    expect(mocks.installUpdate).toHaveBeenCalledWith(update.id, expect.any(ArrayBuffer));
  });

  it("notifyAppReady delegates to the native HybridObject", async () => {
    const SalvePush = await freshSalvePush();
    await SalvePush.notifyAppReady();
    expect(mocks.notifyAppReady).toHaveBeenCalledTimes(1);
  });

  it("getCurrentReleaseId returns whatever the native layer reports", async () => {
    const SalvePush = await freshSalvePush();
    mocks.getCurrentReleaseId.mockResolvedValue("release-42");
    await expect(SalvePush.getCurrentReleaseId()).resolves.toBe("release-42");
  });
});
