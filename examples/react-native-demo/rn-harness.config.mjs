import { androidPlatform, androidEmulator } from '@react-native-harness/platform-android';
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple';

const config = {
  entryPoint: './index.js',
  appRegistryComponentName: 'ReactNativeDemo',

  // The crash-rollback fixture (scripts/test-crash-rollback.sh) deliberately holds the process
  // alive for 8s after sync() so the script has a real window to send a crash signal.
  testTimeout: 15000,

  // Monorepo: SDK source lives outside this package's own directory.
  coverage: {
    root: '../..',
  },

  runners: [
    androidPlatform({
      name: 'android',
      // Full avd details (not just a local AVD name) so the official GitHub Action can create a
      // matching emulator in CI, where "Pixel_6a22" (this dev machine's local AVD) doesn't exist.
      device: androidEmulator('Pixel_6a22', {
        apiLevel: 35,
        profile: 'pixel_6a',
        diskSize: '6G',
        heapSize: '2G',
      }),
      bundleId: 'com.reactnativedemo',
    }),
    applePlatform({
      name: 'ios',
      // Overridable via env: this dev machine only has iOS 26.5 installed, while the GitHub
      // Actions macos-15 runner's default Xcode (16.4) only ships iOS 18.5/iPhone 16 - see
      // .github/workflows/sdk.yml's harness-ios job for the CI values.
      device: appleSimulator(process.env.HARNESS_IOS_DEVICE ?? 'iPhone 17', process.env.HARNESS_IOS_RUNTIME ?? '26.5'),
      bundleId: 'org.reactjs.native.example.ReactNativeDemo',
    }),
  ],
};

export default config;
