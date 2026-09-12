// Update discovery, download and verification (PRD §13/15/17, ADR 0003).
import { sha256Hex, verifyRelease } from "@salve-push/protocol";
import type { SalvePushConfig, UpdateInfo } from "./types";

interface RawReleaseMetadata {
  id: string;
  version: string;
  platform: string;
  channel: string;
  runtime_version: string;
  bundle_hash: string;
  signature?: string;
  size: number;
}

function toUpdateInfo(raw: RawReleaseMetadata): UpdateInfo {
  if (!raw.signature) {
    throw new Error(`release ${raw.id} has no signature; refusing to trust it`);
  }
  return {
    id: raw.id,
    version: raw.version,
    platform: raw.platform,
    channel: raw.channel,
    runtimeVersion: raw.runtime_version,
    bundleHash: raw.bundle_hash,
    signature: raw.signature,
    size: raw.size,
  };
}

export async function fetchLatestUpdate(config: SalvePushConfig): Promise<UpdateInfo | null> {
  const url = new URL("/v1/updates", config.serverUrl);
  url.searchParams.set("channel", config.channel);
  url.searchParams.set("platform", config.platform);
  url.searchParams.set("runtime_version", config.runtimeVersion);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`checkForUpdate failed (${response.status}): ${await response.text()}`);
  }
  const releases = (await response.json()) as RawReleaseMetadata[];
  return releases.length > 0 ? toUpdateInfo(releases[0]) : null;
}

export async function downloadAndVerifyBundle(config: SalvePushConfig, update: UpdateInfo): Promise<Uint8Array> {
  const url = new URL(`/v1/updates/${update.id}/bundle`, config.serverUrl);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`downloadUpdate failed (${response.status}): ${await response.text()}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (sha256Hex(bytes) !== update.bundleHash) {
    throw new Error("downloaded bundle does not match its advertised hash");
  }

  const verified = await verifyRelease(
    config.signingPublicKey,
    {
      bundleHash: update.bundleHash,
      version: update.version,
      platform: update.platform,
      channel: update.channel,
      runtimeVersion: update.runtimeVersion,
    },
    update.signature
  );
  if (!verified) {
    throw new Error("bundle signature verification failed");
  }
  return bytes;
}
