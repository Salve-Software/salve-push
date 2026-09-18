const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // pnpm links dependencies from a central store via symlinks; Metro does not follow them by
    // default, so without this any hoisted package (e.g. @babel/runtime) fails to resolve.
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
  },
  watchFolders: [require('node:path').resolve(__dirname, '../..')],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
