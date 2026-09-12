import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyRelease, generateSigningKeyPair } from "@salve-push/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReleasePayload, publishRelease, type ReleaseParams } from "./release";

let cwd: string;
let bundlePath: string;
let bundleBytes: Buffer;
let privateKey: string;
let publicKey: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "salve-push-release-"));
  bundlePath = join(cwd, "bundle.js");
  bundleBytes = Buffer.from('console.log("hello ota");');
  await writeFile(bundlePath, bundleBytes);
  ({ privateKey, publicKey } = await generateSigningKeyPair());
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function baseParams(overrides: Partial<ReleaseParams> = {}): ReleaseParams {
  return {
    serverUrl: "http://unused.invalid",
    version: "1.5.0",
    platform: "ios",
    channel: "production",
    runtimeVersion: "1.5",
    bundlePath,
    rolloutPercentage: 100,
    privateKey,
    ...overrides,
  };
}

async function listen(server: Server): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  server.listen(0, () => {
    const address = server.address();
    resolve(address && typeof address === "object" ? `http://127.0.0.1:${address.port}` : "");
  });
  return promise;
}

function close(server: Server): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  server.close(() => resolve());
  return promise;
}

describe("buildReleasePayload", () => {
  it("hashes the bundle bytes with SHA-256 in hex", async () => {
    const bytes = await readFile(bundlePath);
    const expectedHash = createHash("sha256").update(bytes).digest("hex");

    const payload = await buildReleasePayload(baseParams());
    expect(payload.bundleHash).toBe(expectedHash);
  });

  it("produces a signature that verifies against the same metadata and public key", async () => {
    const payload = await buildReleasePayload(baseParams());

    await expect(
      verifyRelease(
        publicKey,
        {
          bundleHash: payload.bundleHash,
          version: "1.5.0",
          platform: "ios",
          channel: "production",
          runtimeVersion: "1.5",
        },
        payload.signature
      )
    ).resolves.toBe(true);
  });

  it("produces a signature that fails verification if the channel is later altered", async () => {
    const payload = await buildReleasePayload(baseParams());

    await expect(
      verifyRelease(
        publicKey,
        {
          bundleHash: payload.bundleHash,
          version: "1.5.0",
          platform: "ios",
          channel: "staging",
          runtimeVersion: "1.5",
        },
        payload.signature
      )
    ).resolves.toBe(false);
  });
});

function parseMultipart(body: Buffer, boundary: string): { fields: Record<string, string>; bundle: Buffer } {
  const parts = body.toString("latin1").split(`--${boundary}`);
  const fields: Record<string, string> = {};
  let bundle = Buffer.alloc(0);
  for (const part of parts) {
    const nameMatch = /name="([^"]+)"/.exec(part);
    if (!nameMatch) continue;
    const [, ...rest] = part.split("\r\n\r\n");
    const value = rest.join("\r\n\r\n").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    if (nameMatch[1] === "bundle") {
      bundle = Buffer.from(value, "latin1");
    } else {
      fields[nameMatch[1]] = value;
    }
  }
  return { fields, bundle };
}

describe("publishRelease", () => {
  let server: Server;
  let received: { fields: Record<string, string>; bundle: Buffer } | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    received = undefined;
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const boundary = /boundary=(.+)$/.exec(req.headers["content-type"] ?? "")?.[1];

      if (req.url === "/v1/releases" && req.method === "POST" && boundary) {
        received = parseMultipart(body, boundary);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "test-id", ...received.fields }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    baseUrl = await listen(server);
  });

  afterEach(async () => {
    await close(server);
  });

  it("uploads version, channel, hash and the bundle bytes as multipart fields", async () => {
    await publishRelease(baseParams({ serverUrl: baseUrl }));

    expect(received?.fields.version).toBe("1.5.0");
    expect(received?.fields.channel).toBe("production");
    expect(received?.fields.platform).toBe("ios");
    expect(received?.fields.runtime_version).toBe("1.5");
    expect(received?.fields.rollout_percentage).toBe("100");
    expect(received?.bundle.equals(bundleBytes)).toBe(true);
  });

  it("throws with the server response body when the upload is rejected", async () => {
    await close(server);
    server = createServer((_req, res) => {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("bundle_hash does not match uploaded bundle content");
    });
    const rejectingUrl = await listen(server);

    await expect(publishRelease(baseParams({ serverUrl: rejectingUrl }))).rejects.toThrow(
      /bundle_hash does not match/
    );
  });
});
