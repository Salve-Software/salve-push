// Called directly from the consuming app's MainApplication.getJSBundleFile() — native-native, before the JS runtime exists (ADR 0004).
package com.margelo.nitro.salvepush

import android.content.Context

object SalvePushBundleResolver {
  fun resolveBundleFile(context: Context, defaultBundleFile: String?): String? {
    return SalvePushStorage.resolveBundlePath(context) ?: defaultBundleFile
  }
}
