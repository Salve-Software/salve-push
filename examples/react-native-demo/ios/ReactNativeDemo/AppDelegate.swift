import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// Bound directly to the salve-push SDK's C-linkage entrypoints (see
// packages/sdk-react-native/ios/SalvePushCrashHandler.swift and SalvePushBundleResolver.swift).
// `import SalvePushNative` is intentionally avoided here: pulling the Swift module into this app
// target trips Xcode's Clang module rebuild for HybridObject's C++ interop headers, which needs
// project-wide C++20 settings this example app does not carry. The C ABI is a stable integration
// boundary that sidesteps that entirely.
@_silgen_name("salve_push_install_crash_handler")
private func salve_push_install_crash_handler()

@_silgen_name("salve_push_resolve_bundle_path")
private func salve_push_resolve_bundle_path() -> UnsafeMutablePointer<CChar>?

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // As early as possible, before React Native starts (ADR 0004).
    salve_push_install_crash_handler()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "ReactNativeDemo",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
    // Always call the resolver, even in DEBUG: it also processes any pending crash marker from
    // the previous run (ADR 0004) — that must happen on every launch, not just release builds.
    let resolvedPath = salve_push_resolve_bundle_path()
    defer { if let resolvedPath { free(resolvedPath) } }

#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    guard let resolvedPath else {
      return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    }
    return URL(fileURLWithPath: String(cString: resolvedPath))
#endif
  }
}
