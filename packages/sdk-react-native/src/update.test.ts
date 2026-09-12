import { generateSigningKeyPair, sha256Hex, signRelease } from "@salve-push/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAndVerifyBundle, fetchLatestUpdate } from "./update";
import type { SalvePushConfig, UpdateInfo } from "./types";

const config: SalvePushConfig = {
  serverUrl: "https://ota.example.com",
  channel: "production",
  runtimeVersion: "1.5",
  platform: "ios",
  signingPublicKey: "",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLatestUpdate", () => {
  it("queries /v1/updates with channel, platform and runtime_version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchLatestUpdate(config);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/updates");
    expect(url.searchParams.get("channel")).toBe("production");
    expect(url.searchParams.get("platform")).toBe("ios");
    expect(url.searchParams.get("runtime_version")).toBe("1.5");
  });

  it("returns null when the server has no matching release", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    await expect(fetchLatestUpdate(config)).resolves.toBeNull();
  });

  it("maps the first release into camelCase UpdateInfo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            id: "rel-1",
            version: "1.5.0",
            platform: "ios",
            channel: "production",
            runtime_version: "1.5",
            bundle_hash: "abc123",
            signature: "sig",
            size: 42,
          },
        ])
      )
    );

    await expect(fetchLatestUpdate(config)).resolves.toEqual({
      id: "rel-1",
      version: "1.5.0",
      platform: "ios",
      channel: "production",
      runtimeVersion: "1.5",
      bundleHash: "abc123",
      signature: "sig",
      size: 42,
    });
  });

  it("refuses a release with no signature instead of treating it as installable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            id: "rel-1",
            version: "1.5.0",
            platform: "ios",
            channel: "production",
            runtime_version: "1.5",
            bundle_hash: "abc123",
            size: 42,
          },
        ])
      )
    );

    await expect(fetchLatestUpdate(config)).rejects.toThrow(/signature/);
  });

  it("throws with the server's error body on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("channel is required", { status: 400 }))
    );

    await expect(fetchLatestUpdate(config)).rejects.toThrow(/channel is required/);
  });
});

describe("downloadAndVerifyBundle", () => {
  const bundleBytes = new TextEncoder().encode('console.log("hello ota");');

  async function signedUpdate(bytes: Uint8Array): Promise<{ update: UpdateInfo; publicKey: string }> {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const bundleHash = sha256Hex(bytes);
    const signature = await signRelease(privateKey, {
      bundleHash,
      version: "1.5.0",
      platform: "ios",
      channel: "production",
      runtimeVersion: "1.5",
    });
    return {
      publicKey,
      update: {
        id: "rel-1",
        version: "1.5.0",
        platform: "ios",
        channel: "production",
        runtimeVersion: "1.5",
        bundleHash,
        signature,
        size: bytes.length,
      },
    };
  }

  it("returns the bundle bytes when hash and signature both check out", async () => {
    const { update, publicKey } = await signedUpdate(bundleBytes);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bundleBytes, { status: 200 })));

    await expect(
      downloadAndVerifyBundle({ ...config, signingPublicKey: publicKey }, update)
    ).resolves.toEqual(bundleBytes);
  });

  it("rejects when the downloaded bytes don't match the advertised hash", async () => {
    const { update, publicKey } = await signedUpdate(bundleBytes);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new TextEncoder().encode("tampered bytes"), { status: 200 }))
    );

    await expect(
      downloadAndVerifyBundle({ ...config, signingPublicKey: publicKey }, update)
    ).rejects.toThrow(/hash/);
  });

  it("rejects when the signature does not verify against the configured public key", async () => {
    const { update } = await signedUpdate(bundleBytes);
    const attacker = await generateSigningKeyPair();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bundleBytes, { status: 200 })));

    await expect(
      downloadAndVerifyBundle({ ...config, signingPublicKey: attacker.publicKey }, update)
    ).rejects.toThrow(/signature/);
  });

  it("throws with the server's error body when the bundle download fails", async () => {
    const { update, publicKey } = await signedUpdate(bundleBytes);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

    await expect(
      downloadAndVerifyBundle({ ...config, signingPublicKey: publicKey }, update)
    ).rejects.toThrow(/not found/);
  });
});
