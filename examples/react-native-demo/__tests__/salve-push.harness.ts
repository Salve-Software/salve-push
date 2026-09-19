// react-native-harness E2E: exercises the REAL Nitro HybridObject (native storage/install/rollback)
// on-device. Network is the only thing mocked (global.fetch) so this runs deterministically without
// a live salve-push-server; the SDK<->native round trip is real. See ADR 0004 and
// docs/adr/0004-sdk-install-update.md for the flow this proves.
import { afterEach, describe, expect, it } from 'react-native-harness';
import { Platform } from 'react-native';
import SalvePush from 'react-native-salve-push';
import { sha256Hex, signRelease } from '@salve-push/protocol';

const platform = Platform.OS === 'ios' ? 'ios' : 'android';
const channel = 'staging';
const runtimeVersion = '1.0.0';

describe('SalvePush native integration (real HybridObject, mocked network)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('notifyAppReady resolves without throwing against the real native module', async () => {
    SalvePush.configure({
      serverUrl: 'http://example.invalid',
      channel,
      runtimeVersion,
      platform,
      signingPublicKey: 'unused-for-this-test',
    });

    await expect(SalvePush.notifyAppReady()).resolves.toBeUndefined();
  });

  it('sync() downloads, verifies and installs a real release through the native HybridObject', async () => {
    // Fixed fixture keypair (generateSigningKeyPair() needs crypto.getRandomValues, which Hermes
    // does not provide - key generation is a Node-only CLI concern, not something the SDK
    // itself ever does on-device, so it is out of scope for this on-device test).
    const publicKey = 'zfKkWtgS3/BnNXE3jl6TMrdojMj1R9I0aI4q9v9737g=';
    const privateKey = 'cPBH2q154PUKiHXiorGje/S7p8iAppi0lXO3uWwWZqs=';
    const bundleText = `console.log('harness-${Date.now()}')`;
    const bundleBytes = new TextEncoder().encode(bundleText);
    const bundleHash = sha256Hex(bundleBytes);
    const releaseId = `harness-release-${Date.now()}`;
    const signingInput = { bundleHash, version: '1.0.1', platform, channel, runtimeVersion };
    const signature = await signRelease(privateKey, signingInput);

    const releaseMetadata = {
      id: releaseId,
      version: signingInput.version,
      platform,
      channel,
      runtime_version: runtimeVersion,
      bundle_hash: bundleHash,
      signature,
      size: bundleBytes.byteLength,
    };

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/updates/') && url.endsWith('/bundle')) {
        return new Response(bundleBytes, { status: 200 });
      }
      if (url.includes('/v1/updates')) {
        return new Response(JSON.stringify([releaseMetadata]), { status: 200 });
      }
      throw new Error(`unexpected fetch in harness test: ${url}`);
    }) as typeof fetch;

    SalvePush.configure({
      serverUrl: 'http://example.invalid',
      channel,
      runtimeVersion,
      platform,
      signingPublicKey: publicKey,
    });

    await SalvePush.sync();

    await expect(SalvePush.getCurrentReleaseId()).resolves.toBe(releaseId);
  });
});
