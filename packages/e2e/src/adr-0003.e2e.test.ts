// Proves ADR 0003 end to end: a release signed by the real CLI is accepted by the real SDK, against a real running salve-push-server.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAndWriteSigningKey, loadSigningPrivateKey } from "../../cli/src/keys";
import { publishRelease } from "../../cli/src/release";
import { SalvePush } from "../../sdk-react-native/src/index";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

const SERVER_URL = process.env.SALVE_PUSH_TEST_SERVER_URL ?? "http://localhost:8080";

async function publishSignedRelease(params: {
  cwd: string;
  channel: string;
  platform: string;
  runtimeVersion: string;
  version: string;
  bundleSource: string;
}): Promise<{ id: string; publicKey: string }> {
  const { publicKey } = await generateAndWriteSigningKey(params.cwd);
  const privateKey = await loadSigningPrivateKey(params.cwd, {});

  const bundlePath = join(params.cwd, "bundle.js");
  await writeFile(bundlePath, params.bundleSource);

  const created = await publishRelease({
    serverUrl: SERVER_URL,
    version: params.version,
    platform: params.platform,
    channel: params.channel,
    runtimeVersion: params.runtimeVersion,
    bundlePath,
    rolloutPercentage: 100,
    privateKey,
  });

  const publishResponse = await fetch(`${SERVER_URL}/v1/releases/${created.id}/publish`, { method: "POST" });
  if (!publishResponse.ok) {
    throw new Error(`publish failed: ${publishResponse.status} ${await publishResponse.text()}`);
  }
  return { id: created.id, publicKey };
}

let cwd: string;

beforeAll(async () => {
  const health = await fetch(`${SERVER_URL}/health`).catch(() => null);
  if (!health || !health.ok) {
    throw new Error(
      `salve-push-server is not reachable at ${SERVER_URL}. Run "docker compose up -d" before "pnpm test:e2e".`
    );
  }
});

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "salve-push-e2e-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("ADR 0003 end-to-end: CLI signs, server relays, SDK verifies", () => {
  it("accepts a release signed with the key the SDK was configured with", async () => {
    const channel = `e2e-happy-${Date.now()}`;
    const { id, publicKey } = await publishSignedRelease({
      cwd,
      channel,
      platform: "ios",
      runtimeVersion: "1.0",
      version: "1.0.0",
      bundleSource: `console.log("adr-0003 e2e ${Date.now()}");`,
    });

    SalvePush.configure({
      serverUrl: SERVER_URL,
      channel,
      runtimeVersion: "1.0",
      platform: "ios",
      signingPublicKey: publicKey,
    });

    const update = await SalvePush.checkForUpdate();
    expect(update?.id).toBe(id);

    await expect(SalvePush.downloadUpdate(update!)).resolves.toBeUndefined();
  });

  it("rejects a release whose signature was produced by a different key pair", async () => {
    const channel = `e2e-mismatch-${Date.now()}`;
    const { id } = await publishSignedRelease({
      cwd,
      channel,
      platform: "android",
      runtimeVersion: "1.0",
      version: "2.0.0",
      bundleSource: "console.log('should not verify');",
    });

    const attackerCwd = await mkdtemp(join(tmpdir(), "salve-push-e2e-attacker-"));
    const { publicKey: wrongPublicKey } = await generateAndWriteSigningKey(attackerCwd);
    await rm(attackerCwd, { recursive: true, force: true });

    SalvePush.configure({
      serverUrl: SERVER_URL,
      channel,
      runtimeVersion: "1.0",
      platform: "android",
      signingPublicKey: wrongPublicKey,
    });

    const update = await SalvePush.checkForUpdate();
    expect(update?.id).toBe(id);
    await expect(SalvePush.downloadUpdate(update!)).rejects.toThrow(/signature/);
  });

  it("rejects a release whose bundle was tampered with in transit", async () => {
    const channel = `e2e-tamper-${Date.now()}`;
    const { id, publicKey } = await publishSignedRelease({
      cwd,
      channel,
      platform: "ios",
      runtimeVersion: "1.0",
      version: "3.0.0",
      bundleSource: "console.log('original');",
    });

    SalvePush.configure({
      serverUrl: SERVER_URL,
      channel,
      runtimeVersion: "1.0",
      platform: "ios",
      signingPublicKey: publicKey,
    });

    const update = await SalvePush.checkForUpdate();
    expect(update?.id).toBe(id);

    // The bundle_hash the server reported no longer matches what's on disk
    // in this simulated scenario: tamper with the expected hash so the
    // downloaded bytes fail the integrity check before signature even runs.
    await expect(
      SalvePush.downloadUpdate({ ...update!, bundleHash: "0".repeat(64) })
    ).rejects.toThrow(/hash/);
  });
});
