// Dedicated Jest config for scripts/test-crash-rollback.sh - targets ONLY the crash-rollback
// fixture, which jest.harness.config.mjs deliberately excludes from the regular harness suite.
export default {
  preset: "react-native-harness",
  testMatch: ["**/__tests__/fixtures/crash-rollback.harness.{js,ts,tsx}"],
};
