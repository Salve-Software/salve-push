import { describe, expect, it } from "vitest";
import {
  canonicalReleaseMessage,
  generateSigningKeyPair,
  signRelease,
  verifyRelease,
} from "./signing";

const release = {
  bundleHash: "f0bd0f58d7f8207f8beab6d1480742c849219b3fff3e4addb2f0b336bd25fcf",
  version: "1.5.0",
  platform: "ios",
  channel: "production",
  runtimeVersion: "1.5",
};

describe("canonicalReleaseMessage", () => {
  it("joins hash and metadata with newlines in a fixed order", () => {
    expect(canonicalReleaseMessage(release)).toBe(
      "f0bd0f58d7f8207f8beab6d1480742c849219b3fff3e4addb2f0b336bd25fcf\n1.5.0\nios\nproduction\n1.5"
    );
  });
});

describe("signRelease / verifyRelease", () => {
  it("verifies a signature produced for the same release metadata", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const signature = await signRelease(privateKey, release);

    await expect(verifyRelease(publicKey, release, signature)).resolves.toBe(true);
  });

  it("rejects a signature when the bundle hash was substituted", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const signature = await signRelease(privateKey, release);

    await expect(
      verifyRelease(publicKey, { ...release, bundleHash: "0".repeat(64) }, signature)
    ).resolves.toBe(false);
  });

  it("rejects a signature when the channel was substituted", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const signature = await signRelease(privateKey, release);

    await expect(
      verifyRelease(publicKey, { ...release, channel: "development" }, signature)
    ).resolves.toBe(false);
  });

  it("rejects a signature when the rollout metadata is smuggled via version", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const signature = await signRelease(privateKey, release);

    await expect(
      verifyRelease(publicKey, { ...release, version: "1.5.0-evil" }, signature)
    ).resolves.toBe(false);
  });

  it("rejects a signature produced by a different key pair", async () => {
    const signer = await generateSigningKeyPair();
    const attacker = await generateSigningKeyPair();
    const signature = await signRelease(signer.privateKey, release);

    await expect(verifyRelease(attacker.publicKey, release, signature)).resolves.toBe(false);
  });

  it("rejects a malformed base64 signature instead of throwing", async () => {
    const { publicKey } = await generateSigningKeyPair();

    await expect(verifyRelease(publicKey, release, "not-valid-base64!!")).resolves.toBe(false);
  });
});

describe("generateSigningKeyPair", () => {
  it("returns a distinct key pair on every call", async () => {
    const a = await generateSigningKeyPair();
    const b = await generateSigningKeyPair();

    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });

  it("returns base64-encoded 32-byte keys", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();

    expect(Buffer.from(privateKey, "base64")).toHaveLength(32);
    expect(Buffer.from(publicKey, "base64")).toHaveLength(32);
  });
});
