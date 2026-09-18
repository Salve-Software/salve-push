// Called directly from the consuming app's AppDelegate.bundleURL() — native-native, before the JS runtime exists (ADR 0004).
import Foundation

@objc(SalvePushBundleResolver)
public class SalvePushBundleResolver: NSObject {
  @objc public static func resolveBundleURL(default defaultURL: URL?) -> URL? {
    guard let path = SalvePushStorage.resolveBundlePath() else {
      return defaultURL
    }
    return URL(fileURLWithPath: path)
  }
}

/// C-linkage entrypoint for consumers that call into this SDK without a Swift module import
/// (see SalvePushCrashHandler.swift for why). Declare it in a bridging header:
/// `extern const char *_Nullable salve_push_resolve_bundle_path(void);`
/// The returned pointer, when non-null, is heap-allocated with `strdup` and must be `free`d by
/// the caller; this is called at most once per app launch so the cost is negligible.
@_cdecl("salve_push_resolve_bundle_path")
public func salve_push_resolve_bundle_path_c() -> UnsafeMutablePointer<CChar>? {
  SalvePushStorage.resolveBundlePath().map { strdup($0) }
}
