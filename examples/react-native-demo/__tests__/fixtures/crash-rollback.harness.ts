// Fixture used ONLY by scripts/test-crash-rollback.sh - not part of the regular harness suite
// (excluded from jest.harness.config.mjs's testMatch). Drives SalvePush.sync()/notifyAppReady()
// programmatically so the script doesn't depend on flaky UI tap coordinates; the crash induction,
// process relaunch, and state.json assertions happen in the shell script around these two steps.
import { describe, it } from 'react-native-harness';
import { Platform } from 'react-native';
import SalvePush from 'react-native-salve-push';

const platform = Platform.OS === 'ios' ? 'ios' : 'android';

// Paired with the private key scripts/test-crash-rollback.sh uses to sign the releases it uploads.
const TEST_PUBLIC_KEY = 'zfKkWtgS3/BnNXE3jl6TMrdojMj1R9I0aI4q9v9737g=';

SalvePush.configure({
  serverUrl: platform === 'android' ? 'http://10.0.2.2:8090' : 'http://localhost:8090',
  channel: 'staging',
  runtimeVersion: '1.0.0',
  platform,
  signingPublicKey: TEST_PUBLIC_KEY,
});

describe('crash-rollback fixture', () => {
  it('sync to the latest published release', async () => {
    await SalvePush.sync();
    // Hold the process alive so scripts/test-crash-rollback.sh has a real window to send a crash
    // signal while boot is still "pending" - Harness tears the app down as soon as this resolves.
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 8000);
    await promise;
  });

  it('confirm the current release booted successfully', async () => {
    await SalvePush.notifyAppReady();
  });
});
