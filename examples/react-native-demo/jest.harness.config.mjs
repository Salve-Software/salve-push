export default {
  preset: "react-native-harness",
  // Single "*" segment (not "**") - matches direct children of __tests__/ only, so
  // __tests__/fixtures/*.harness.ts is excluded from the regular suite. Needed because the
  // harness CLI silently overrides testPathIgnorePatterns with its own value (platform-suffix
  // filtering) instead of merging it - testMatch is the only exclusion mechanism it honors.
  testMatch: ["<rootDir>/__tests__/*.harness.{js,ts,tsx}"],
};
