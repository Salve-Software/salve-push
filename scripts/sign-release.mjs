#!/usr/bin/env node
// Helper for scripts/test-crash-rollback.sh: signs a release the same way salve-push-cli would,
// using @salve-push/protocol. Prints { bundleHash, signature } as JSON on stdout.
//
// Usage: node sign-release.mjs <bundlePath> <version> <platform> <channel> <runtimeVersion> <privateKeyBase64>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const { sha256Hex, signRelease } = require(join(repoRoot, "packages/protocol/dist/signing.js"));

const [bundlePath, version, platform, channel, runtimeVersion, privateKey] = process.argv.slice(2);
if (!bundlePath || !version || !platform || !channel || !runtimeVersion || !privateKey) {
  console.error(
    "Usage: sign-release.mjs <bundlePath> <version> <platform> <channel> <runtimeVersion> <privateKeyBase64>"
  );
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(bundlePath));
const bundleHash = sha256Hex(bytes);
const signature = await signRelease(privateKey, { bundleHash, version, platform, channel, runtimeVersion });

console.log(JSON.stringify({ bundleHash, signature }));
