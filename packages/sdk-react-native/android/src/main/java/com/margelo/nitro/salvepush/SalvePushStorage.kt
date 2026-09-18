// Filesystem layout for installed releases (ADR 0004): releases/, state.json, mount.marker, crash.marker.
// Every function takes Context explicitly: getJSBundleFile() runs before the
// React bridge (and therefore NitroModules.applicationContext) exists.
package com.margelo.nitro.salvepush

import android.content.Context
import org.json.JSONObject
import java.io.File

object SalvePushStorage {
  fun baseDirectory(context: Context): File {
    val dir = File(context.filesDir, "salve-push")
    dir.mkdirs()
    return dir
  }

  private fun releasesDirectory(context: Context): File {
    val dir = File(baseDirectory(context), "releases")
    dir.mkdirs()
    return dir
  }

  private fun bundlePath(context: Context, releaseId: String): File =
    File(File(releasesDirectory(context), releaseId), "bundle.js")

  private fun statePath(context: Context): File = File(baseDirectory(context), "state.json")

  private fun mountMarkerPath(context: Context): File = File(baseDirectory(context), "mount.marker")

  private fun crashMarkerPath(context: Context): File = File(baseDirectory(context), "crash.marker")

  private fun readState(context: Context): SalvePushState {
    return try {
      SalvePushState.fromJson(statePath(context).readText())
    } catch (e: Exception) {
      SalvePushState.confirmedEmpty
    }
  }

  private fun writeState(context: Context, state: SalvePushState) {
    val tmp = File(baseDirectory(context), "state.json.tmp")
    tmp.writeText(state.toJson())
    tmp.renameTo(statePath(context))
  }

  private fun markMounted(context: Context) {
    mountMarkerPath(context).createNewFile()
  }

  private fun clearMountedMarker(context: Context) {
    mountMarkerPath(context).delete()
  }

  fun isMounted(context: Context): Boolean = mountMarkerPath(context).exists()

  fun installUpdate(context: Context, releaseId: String, bundle: ByteArray) {
    val releaseDir = File(releasesDirectory(context), releaseId)
    releaseDir.mkdirs()
    val finalFile = File(releaseDir, "bundle.js")
    val tempFile = File(releaseDir, "bundle.js.tmp")
    tempFile.writeBytes(bundle)
    if (finalFile.exists()) finalFile.delete()
    tempFile.renameTo(finalFile)

    val previousState = readState(context)
    val previous = previousState.currentReleaseId
    writeState(
      context,
      previousState.copy(
        previousReleaseId = previous,
        currentReleaseId = releaseId,
        bootStatus = "pending",
      ),
    )
    clearMountedMarker(context)

    pruneOldReleases(context, listOfNotNull(releaseId, previous))
  }

  fun confirmBoot(context: Context) {
    markMounted(context)
    writeState(context, readState(context).copy(bootStatus = "confirmed"))
  }

  fun getCurrentReleaseId(context: Context): String =
    readState(context).currentReleaseId ?: ""

  /** Called by getJSBundleFile() before JS boots. Returns null to fall back to the embedded bundle. */
  fun resolveBundlePath(context: Context): String? {
    processCrashMarkerIfPresent(context)
    val currentId = readState(context).currentReleaseId ?: return null
    val path = bundlePath(context, currentId)
    return if (path.exists()) path.absolutePath else null
  }

  private fun processCrashMarkerIfPresent(context: Context) {
    val marker = crashMarkerPath(context)
    if (!marker.exists()) return
    val content = try {
      JSONObject(marker.readText())
    } catch (e: Exception) {
      null
    }
    marker.delete()
    if (content?.optBoolean("isAutoRollback", false) == true) {
      rollbackToPrevious(context)
    }
  }

  /** Called by the same-session exception handler when a crash happens before the current release confirmed boot. */
  fun rollbackToPreviousIfUnconfirmed(context: Context) {
    if (!isMounted(context)) {
      rollbackToPrevious(context)
    }
  }

  private fun rollbackToPrevious(context: Context) {
    val state = readState(context)
    val previous = state.previousReleaseId ?: return
    writeState(
      context,
      state.copy(currentReleaseId = previous, previousReleaseId = null, bootStatus = "confirmed"),
    )
    markMounted(context)
  }

  private fun pruneOldReleases(context: Context, keep: List<String>) {
    releasesDirectory(context).listFiles()?.forEach { entry ->
      if (!keep.contains(entry.name)) {
        entry.deleteRecursively()
      }
    }
  }
}
