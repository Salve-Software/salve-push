// Installed explicitly by the consuming app (e.g. MainApplication.onCreate(), before super.onCreate()) so crashes
// during bridge/module init are covered too (ADR 0004). Two layers: a native POSIX signal handler for real crashes
// (segfault, abort, ...), and a same-session Thread.UncaughtExceptionHandler for uncaught Java/Kotlin exceptions
// that reverts immediately if the current release never confirmed boot.
package com.margelo.nitro.salvepush

import android.content.Context
import androidx.annotation.Keep

@Keep
object SalvePushCrashHandler {
  private var didInstallNative = false

  fun install(context: Context) {
    val appContext = context.applicationContext
    installNativeSignalHandlers(appContext)
    installUncaughtExceptionHandler(appContext)
  }

  private fun installNativeSignalHandlers(context: Context) {
    if (didInstallNative) return
    System.loadLibrary("salvepush")
    nativeInstall(SalvePushStorage.baseDirectory(context).absolutePath)
    didInstallNative = true
  }

  private fun installUncaughtExceptionHandler(context: Context) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      SalvePushStorage.rollbackToPreviousIfUnconfirmed(context)
      previous?.uncaughtException(thread, throwable)
    }
  }

  private external fun nativeInstall(baseDirectory: String)
}
