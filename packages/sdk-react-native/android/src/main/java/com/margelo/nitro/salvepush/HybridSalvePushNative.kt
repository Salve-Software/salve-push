// HybridObject implementation exposing install/notifyAppReady to JS (ADR 0004).
package com.margelo.nitro.salvepush

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise

@Keep
@DoNotStrip
class HybridSalvePushNative : HybridSalvePushNativeSpec() {
  private val context
    get() = NitroModules.applicationContext
      ?: throw Error("No ApplicationContext set!")

  override fun installUpdate(releaseId: String, bundle: ArrayBuffer): Promise<Unit> {
    return Promise.parallel {
      SalvePushStorage.installUpdate(context, releaseId, bundle.toByteArray())
    }
  }

  override fun notifyAppReady(): Promise<Unit> {
    return Promise.parallel {
      SalvePushStorage.confirmBoot(context)
    }
  }

  override fun getCurrentReleaseId(): String {
    return SalvePushStorage.getCurrentReleaseId(context)
  }
}
