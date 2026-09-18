// HybridObject implementation exposing install/notifyAppReady to JS (ADR 0004).
import Foundation
import NitroModules

final class HybridSalvePushNative: HybridSalvePushNativeSpec {
  private static let queue = DispatchQueue(label: "com.salvesoftware.salvepush.storage")

  func installUpdate(releaseId: String, bundle: ArrayBuffer) throws -> Promise<Void> {
    return Promise.parallel(Self.queue) {
      let data = bundle.toData(copyIfNeeded: true)
      try SalvePushStorage.installUpdate(releaseId: releaseId, bundle: data)
    }
  }

  func notifyAppReady() throws -> Promise<Void> {
    return Promise.parallel(Self.queue) {
      try SalvePushStorage.confirmBoot()
    }
  }

  func getCurrentReleaseId() throws -> String {
    return SalvePushStorage.getCurrentReleaseId()
  }
}
