export default {
  preset: "react-native-harness",
  testMatch: ["**/*.harness.{js,ts,tsx}"],
  // fixtures/ is only invoked explicitly by scripts/test-crash-rollback.sh, never as part of the
  // regular harness suite (it mutates persistent on-device state across two separate CLI runs).
  testPathIgnorePatterns: ["/node_modules/", "/__tests__/fixtures/"],
};
