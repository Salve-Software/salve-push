// Called directly from the consuming app's AppDelegate, as early as possible (e.g. before
// `application(_:didFinishLaunchingWithOptions:)` returns) so crashes during bridge init are covered too (ADR 0004).
import Foundation

@objc(SalvePushCrashHandler)
public final class SalvePushCrashHandler: NSObject {
  @objc public static func install() {
    SalvePushCrashHandlerBridge.install(withBaseDirectory: SalvePushStorage.baseDirectory().path)
  }
}

/// C-linkage entrypoint for consumers that call into this SDK without a Swift module import
/// (e.g. from an app target where importing the SalvePushNative module directly triggers Xcode's
/// Clang module rebuild for HybridObject's C++ interop headers). Declare it in a bridging header:
/// `extern void salve_push_install_crash_handler(void);`
@_cdecl("salve_push_install_crash_handler")
public func salve_push_install_crash_handler_c() {
  SalvePushCrashHandler.install()
}
