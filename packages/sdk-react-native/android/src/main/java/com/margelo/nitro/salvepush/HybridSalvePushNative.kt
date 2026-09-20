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
    // ArrayBuffer is bridge-backed and only safe to touch synchronously, on this call - copy it to
    // a plain ByteArray before crossing onto the background queue (see ADR 0004 postmortem).
    val bytes = bundle.toByteArray()
    return Promise.parallel {
      SalvePushStorage.installUpdate(context, releaseId, bytes)
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
