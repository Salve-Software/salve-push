// Unit tests for SalvePushStorage (ADR 0004) - runs against a scratch directory via
// baseDirectoryOverride, never the real Application Support directory.
import XCTest

@testable import SalvePushStorageCore

final class SalvePushStorageTests: XCTestCase {
  private var scratchDir: URL!

  override func setUp() {
    super.setUp()
    scratchDir = FileManager.default.temporaryDirectory
      .appendingPathComponent("salve-push-tests-\(UUID().uuidString)", isDirectory: true)
    try! FileManager.default.createDirectory(at: scratchDir, withIntermediateDirectories: true)
    SalvePushStorage.baseDirectoryOverride = scratchDir
  }

  override func tearDown() {
    try? FileManager.default.removeItem(at: scratchDir)
    SalvePushStorage.baseDirectoryOverride = nil
    super.tearDown()
  }

  func testInstallUpdateWritesBundleAndUpdatesState() throws {
    let bundle = Data("console.log('A')".utf8)

    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: bundle)

    XCTAssertEqual(SalvePushStorage.getCurrentReleaseId(), "release-a")
    let written = try Data(contentsOf: SalvePushStorage.bundlePath(for: "release-a"))
    XCTAssertEqual(written, bundle)
    XCTAssertFalse(SalvePushStorage.isMounted(), "installUpdate must clear the mount marker until the app confirms boot")
  }

  func testInstallUpdateRecordsThePreviousReleaseForRollback() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))
    try SalvePushStorage.confirmBoot()

    try SalvePushStorage.installUpdate(releaseId: "release-b", bundle: Data("b".utf8))

    let state = SalvePushStorage.readState()
    XCTAssertEqual(state.currentReleaseId, "release-b")
    XCTAssertEqual(state.previousReleaseId, "release-a")
    XCTAssertEqual(state.bootStatus, "pending")
  }

  func testInstallUpdatePrunesReleasesOtherThanCurrentAndPrevious() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))
    try SalvePushStorage.confirmBoot()
    try SalvePushStorage.installUpdate(releaseId: "release-b", bundle: Data("b".utf8))
    try SalvePushStorage.confirmBoot()

    try SalvePushStorage.installUpdate(releaseId: "release-c", bundle: Data("c".utf8))

    let releases = try FileManager.default.contentsOfDirectory(
      at: SalvePushStorage.releasesDirectory(), includingPropertiesForKeys: nil
    ).map(\.lastPathComponent)
    XCTAssertEqual(Set(releases), Set(["release-b", "release-c"]))
  }

  func testConfirmBootMarksMountedAndConfirmed() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))

    try SalvePushStorage.confirmBoot()

    XCTAssertTrue(SalvePushStorage.isMounted())
    XCTAssertEqual(SalvePushStorage.readState().bootStatus, "confirmed")
  }

  func testResolveBundlePathReturnsNilWhenNothingInstalled() {
    XCTAssertNil(SalvePushStorage.resolveBundlePath())
  }

  func testResolveBundlePathReturnsInstalledBundleWhenNoCrashMarker() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))

    let path = SalvePushStorage.resolveBundlePath()

    XCTAssertEqual(path, SalvePushStorage.bundlePath(for: "release-a").path)
  }

  func testResolveBundlePathRollsBackWhenCrashMarkerRequestsAutoRollback() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))
    try SalvePushStorage.confirmBoot()
    try SalvePushStorage.installUpdate(releaseId: "release-b", bundle: Data("b".utf8))
    let crashMarker = Data(#"{"signal":6,"isAutoRollback":true}"#.utf8)
    try crashMarker.write(to: SalvePushStorage.crashMarkerPath())

    let path = SalvePushStorage.resolveBundlePath()

    XCTAssertEqual(path, SalvePushStorage.bundlePath(for: "release-a").path)
    XCTAssertEqual(SalvePushStorage.getCurrentReleaseId(), "release-a")
    XCTAssertNil(SalvePushStorage.readState().previousReleaseId)
    XCTAssertTrue(SalvePushStorage.isMounted(), "a rolled-back release is trusted immediately")
    XCTAssertFalse(
      FileManager.default.fileExists(atPath: SalvePushStorage.crashMarkerPath().path),
      "the crash marker must be consumed so it isn't reprocessed on the next launch")
  }

  func testResolveBundlePathDoesNotRollBackWhenCrashMarkerDoesNotRequestIt() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))
    try SalvePushStorage.confirmBoot()
    try SalvePushStorage.installUpdate(releaseId: "release-b", bundle: Data("b".utf8))
    // A crash after boot was confirmed (isAutoRollback: false) must not revert the release.
    let crashMarker = Data(#"{"signal":11,"isAutoRollback":false}"#.utf8)
    try crashMarker.write(to: SalvePushStorage.crashMarkerPath())

    _ = SalvePushStorage.resolveBundlePath()

    XCTAssertEqual(SalvePushStorage.getCurrentReleaseId(), "release-b")
  }

  func testRollbackToPreviousIfUnconfirmedDoesNothingWhenAlreadyMounted() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))
    try SalvePushStorage.confirmBoot()
    try SalvePushStorage.installUpdate(releaseId: "release-b", bundle: Data("b".utf8))
    try SalvePushStorage.confirmBoot()

    SalvePushStorage.rollbackToPreviousIfUnconfirmed()

    XCTAssertEqual(SalvePushStorage.getCurrentReleaseId(), "release-b")
  }

  func testRollbackToPreviousIfUnconfirmedRevertsWhenBootNeverConfirmed() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))
    try SalvePushStorage.confirmBoot()
    try SalvePushStorage.installUpdate(releaseId: "release-b", bundle: Data("b".utf8))

    SalvePushStorage.rollbackToPreviousIfUnconfirmed()

    XCTAssertEqual(SalvePushStorage.getCurrentReleaseId(), "release-a")
    XCTAssertTrue(SalvePushStorage.isMounted())
  }

  func testRollbackToPreviousIfUnconfirmedIsANoOpWithoutAPreviousRelease() throws {
    try SalvePushStorage.installUpdate(releaseId: "release-a", bundle: Data("a".utf8))

    SalvePushStorage.rollbackToPreviousIfUnconfirmed()

    XCTAssertEqual(SalvePushStorage.getCurrentReleaseId(), "release-a")
  }
}
