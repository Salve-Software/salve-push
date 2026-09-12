// Bundle hashing, signing and upload for `salve-push release` (PRD §21-22, ADR 0003).
import { sha256Hex, signRelease, type ReleaseMetadata } from "@salve-push/protocol";
import { readFile } from "node:fs/promises";

export interface ReleaseParams {
  serverUrl: string;
  version: string;
  platform: string;
  channel: string;
  runtimeVersion: string;
  bundlePath: string;
  rolloutPercentage?: number;
  privateKey: string;
}

export interface ReleasePayload {
  bundleHash: string;
  signature: string;
  bundleBytes: Buffer;
}

export async function buildReleasePayload(params: ReleaseParams): Promise<ReleasePayload> {
  const bundleBytes = await readFile(params.bundlePath);
  const bundleHash = sha256Hex(new Uint8Array(bundleBytes));
  const signature = await signRelease(params.privateKey, {
    bundleHash,
    version: params.version,
    platform: params.platform,
    channel: params.channel,
    runtimeVersion: params.runtimeVersion,
  });
  return { bundleHash, signature, bundleBytes };
}

export async function publishRelease(params: ReleaseParams): Promise<ReleaseMetadata> {
  const { bundleHash, signature, bundleBytes } = await buildReleasePayload(params);

  const form = new FormData();
  form.append("version", params.version);
  form.append("platform", params.platform);
  form.append("channel", params.channel);
  form.append("runtime_version", params.runtimeVersion);
  form.append("bundle_hash", bundleHash);
  form.append("signature", signature);
  form.append("rollout_percentage", String(params.rolloutPercentage ?? 100));
  form.append("bundle", new Blob([new Uint8Array(bundleBytes)]), "bundle.js");

  const response = await fetch(`${params.serverUrl}/v1/releases`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`release upload failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<ReleaseMetadata>;
}
