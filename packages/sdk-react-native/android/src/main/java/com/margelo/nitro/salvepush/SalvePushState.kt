// On-device pointer state for the active/previous release (ADR 0004).
package com.margelo.nitro.salvepush

import org.json.JSONObject

data class SalvePushState(
  val currentReleaseId: String?,
  val previousReleaseId: String?,
  val bootStatus: String,
) {
  fun toJson(): String {
    val json = JSONObject()
    json.put("currentReleaseId", currentReleaseId)
    json.put("previousReleaseId", previousReleaseId)
    json.put("bootStatus", bootStatus)
    return json.toString()
  }

  companion object {
    val confirmedEmpty = SalvePushState(
      currentReleaseId = null,
      previousReleaseId = null,
      bootStatus = "confirmed",
    )

    fun fromJson(raw: String): SalvePushState {
      val json = JSONObject(raw)
      return SalvePushState(
        currentReleaseId = json.optNullableString("currentReleaseId"),
        previousReleaseId = json.optNullableString("previousReleaseId"),
        bootStatus = json.optString("bootStatus", "confirmed"),
      )
    }
  }
}
