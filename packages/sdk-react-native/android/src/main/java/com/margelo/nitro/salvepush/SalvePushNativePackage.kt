// Registers no NativeModules - SalvePushNative is a Nitro HybridObject, constructed on the JS
// side via NitroModules.createHybridObject(). This class exists purely so React Native's Android
// autolinking discovers this library as a Gradle dependency (see cli-config-android's
// findPackageClassName heuristic) and so the native library loads as early as possible.
package com.margelo.nitro.salvepush

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

class SalvePushNativePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { HashMap() }

  companion object {
    init {
      System.loadLibrary("salvepush")
    }
  }
}
