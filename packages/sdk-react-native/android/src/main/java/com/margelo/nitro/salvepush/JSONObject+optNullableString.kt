// Reads a JSON string field that may be absent or explicit null, as a Kotlin nullable.
package com.margelo.nitro.salvepush

import org.json.JSONObject

internal fun JSONObject.optNullableString(key: String): String? =
  if (has(key) && !isNull(key)) getString(key) else null
