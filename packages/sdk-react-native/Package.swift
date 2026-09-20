// swift-tools-version:5.9
// Test-only SPM package for SalvePushStorage/SalvePushState (ADR 0004). These two files are pure
// Foundation with no Nitro/React Native dependency, so they can be unit tested directly with
// `swift test` - fast, no simulator, no CocoaPods. The real Nitro pod (SalvePushNative.podspec)
// still owns these files for production builds via its own `ios/**/*.swift` glob; this package
// only exists so `swift test` can compile and run ios/Tests/SalvePushStorageTests.swift.
//
// Run: swift test --package-path packages/sdk-react-native
import PackageDescription

let package = Package(
  name: "SalvePushStorageCore",
  platforms: [.macOS(.v13), .iOS(.v15)],
  targets: [
    .target(
      name: "SalvePushStorageCore",
      path: "ios",
      sources: ["SalvePushStorage.swift", "SalvePushState.swift"]
    ),
    .testTarget(
      name: "SalvePushStorageCoreTests",
      dependencies: ["SalvePushStorageCore"],
      path: "ios/Tests"
    ),
  ]
)
