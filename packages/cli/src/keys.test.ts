import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAndWriteSigningKey, loadSigningPrivateKey, resolveSigningKeyPath } from "./keys";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "salve-push-keys-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("resolveSigningKeyPath", () => {
  it("points at .salve-push/signing.key under the given directory", () => {
    expect(resolveSigningKeyPath(cwd)).toBe(join(cwd, ".salve-push", "signing.key"));
  });
});

describe("generateAndWriteSigningKey", () => {
  it("writes a private key file readable by loadSigningPrivateKey", async () => {
    const { publicKey } = await generateAndWriteSigningKey(cwd);

    const loaded = await loadSigningPrivateKey(cwd, {});
    expect(loaded).toHaveLength(44);
    expect(publicKey).toHaveLength(44);
  });

  it("generates a different key pair on every call when forced", async () => {
    const first = await generateAndWriteSigningKey(cwd);
    const second = await generateAndWriteSigningKey(cwd, { force: true });
    expect(first.publicKey).not.toBe(second.publicKey);
  });

  it("refuses to overwrite an existing key file without force", async () => {
    await generateAndWriteSigningKey(cwd);
    await expect(generateAndWriteSigningKey(cwd)).rejects.toThrow(/already exists/);
  });

  it("leaves the existing private key intact when the overwrite is refused", async () => {
    await generateAndWriteSigningKey(cwd);
    const before = await loadSigningPrivateKey(cwd, {});
    await expect(generateAndWriteSigningKey(cwd)).rejects.toThrow();
    const after = await loadSigningPrivateKey(cwd, {});
    expect(after).toBe(before);
  });

  it("overwrites the existing key file when force is true", async () => {
    const { publicKey: firstPublicKey } = await generateAndWriteSigningKey(cwd);
    const { publicKey: secondPublicKey } = await generateAndWriteSigningKey(cwd, { force: true });
    expect(secondPublicKey).not.toBe(firstPublicKey);
  });
});

describe("loadSigningPrivateKey", () => {
  it("prefers SALVE_PUSH_SIGNING_KEY over the file when both are present", async () => {
    await generateAndWriteSigningKey(cwd);
    const loaded = await loadSigningPrivateKey(cwd, { SALVE_PUSH_SIGNING_KEY: "env-key-value" });
    expect(loaded).toBe("env-key-value");
  });

  it("throws a clear error when no key file and no env var exist", async () => {
    await expect(loadSigningPrivateKey(cwd, {})).rejects.toThrow(/salve-push keys generate/);
  });

  it("trims trailing newlines from the key file", async () => {
    const { keyPath } = await generateAndWriteSigningKey(cwd);
    const raw = await readFile(keyPath, "utf8");
    expect(raw.endsWith("\n") || raw === raw.trim()).toBe(true);
    const loaded = await loadSigningPrivateKey(cwd, {});
    expect(loaded).toBe(raw.trim());
  });
});
