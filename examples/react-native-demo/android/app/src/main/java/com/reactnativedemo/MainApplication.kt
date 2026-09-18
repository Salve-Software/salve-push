package com.reactnativedemo

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.margelo.nitro.salvepush.SalvePushBundleResolver
import com.margelo.nitro.salvepush.SalvePushCrashHandler

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
      // Always resolved, even though dev-support (Metro) wins in debug builds: this also
      // processes any pending crash marker from the previous run (ADR 0004), which must happen
      // on every launch, not only release builds.
      jsBundleFilePath = SalvePushBundleResolver.resolveBundleFile(applicationContext, null),
    )
  }

  override fun onCreate() {
    super.onCreate()
    // As early as possible, before React Native starts (ADR 0004).
    SalvePushCrashHandler.install(this)
    loadReactNative(this)
  }
}
