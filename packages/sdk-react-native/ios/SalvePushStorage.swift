// Filesystem layout for installed releases (ADR 0004): releases/, state.json, mount.marker, crash.marker.
import Foundation

enum SalvePushStorage {
  static func baseDirectory() -> URL {
    let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let dir = appSupport.appendingPathComponent("salve-push", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  static func releasesDirectory() -> URL {
    baseDirectory().appendingPathComponent("releases", isDirectory: true)
  }

  static func bundlePath(for releaseId: String) -> URL {
    releasesDirectory().appendingPathComponent(releaseId, isDirectory: true).appendingPathComponent("bundle.js")
  }

  static func statePath() -> URL {
    baseDirectory().appendingPathComponent("state.json")
  }

  static func mountMarkerPath() -> URL {
    baseDirectory().appendingPathComponent("mount.marker")
  }

  static func crashMarkerPath() -> URL {
    baseDirectory().appendingPathComponent("crash.marker")
  }

  static func readState() -> SalvePushState {
    guard let data = try? Data(contentsOf: statePath()),
      let state = try? JSONDecoder().decode(SalvePushState.self, from: data)
    else {
      return SalvePushState(currentReleaseId: nil, previousReleaseId: nil, bootStatus: "confirmed")
    }
    return state
  }

  static func writeState(_ state: SalvePushState) throws {
    let data = try JSONEncoder().encode(state)
    try data.write(to: statePath(), options: .atomic)
  }

  static func markMounted() {
    FileManager.default.createFile(atPath: mountMarkerPath().path, contents: nil)
  }

  static func clearMountedMarker() {
    try? FileManager.default.removeItem(at: mountMarkerPath())
  }

  static func isMounted() -> Bool {
    FileManager.default.fileExists(atPath: mountMarkerPath().path)
  }

  static func installUpdate(releaseId: String, bundle: Data) throws {
    let releaseDir = releasesDirectory().appendingPathComponent(releaseId, isDirectory: true)
    try FileManager.default.createDirectory(at: releaseDir, withIntermediateDirectories: true)
    let finalPath = releaseDir.appendingPathComponent("bundle.js")
    let tempPath = releaseDir.appendingPathComponent("bundle.js.tmp")
    try bundle.write(to: tempPath, options: .atomic)
    if FileManager.default.fileExists(atPath: finalPath.path) {
      try FileManager.default.removeItem(at: finalPath)
    }
    try FileManager.default.moveItem(at: tempPath, to: finalPath)

    var state = readState()
    let previous = state.currentReleaseId
    state.previousReleaseId = previous
    state.currentReleaseId = releaseId
    state.bootStatus = "pending"
    try writeState(state)
    clearMountedMarker()

    pruneOldReleases(keep: [releaseId, previous].compactMap { $0 })
  }

  static func confirmBoot() throws {
    markMounted()
    var state = readState()
    state.bootStatus = "confirmed"
    try writeState(state)
  }

  static func getCurrentReleaseId() -> String {
    readState().currentReleaseId ?? ""
  }

  /// Called by bundleURL()/getJSBundleFile() before JS boots. Returns the
  /// bundle path to use, or nil to fall back to the app's embedded bundle.
  static func resolveBundlePath() -> String? {
    processCrashMarkerIfPresent()
    guard let currentId = readState().currentReleaseId else { return nil }
    let path = bundlePath(for: currentId)
    guard FileManager.default.fileExists(atPath: path.path) else { return nil }
    return path.path
  }

  private static func processCrashMarkerIfPresent() {
    guard let data = try? Data(contentsOf: crashMarkerPath()) else { return }
    try? FileManager.default.removeItem(at: crashMarkerPath())
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      json["isAutoRollback"] as? Bool == true
    else { return }
    rollbackToPrevious()
  }

  /// Called by the same-session exception handler when a crash happens
  /// before the current release confirmed boot.
  static func rollbackToPreviousIfUnconfirmed() {
    guard !isMounted() else { return }
    rollbackToPrevious()
  }

  private static func rollbackToPrevious() {
    var state = readState()
    guard let previous = state.previousReleaseId else { return }
    state.currentReleaseId = previous
    state.previousReleaseId = nil
    state.bootStatus = "confirmed"
    try? writeState(state)
    markMounted()
  }

  private static func pruneOldReleases(keep: [String]) {
    guard
      let entries = try? FileManager.default.contentsOfDirectory(
        at: releasesDirectory(), includingPropertiesForKeys: nil)
    else { return }
    for entry in entries where !keep.contains(entry.lastPathComponent) {
      try? FileManager.default.removeItem(at: entry)
    }
  }
}
