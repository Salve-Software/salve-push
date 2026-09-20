// Unit tests for SalvePushStorage (ADR 0004), mirroring ios/Tests/SalvePushStorageTests.swift.
// Context is a plain Mockito mock returning a scratch temp directory - no Robolectric needed
// since SalvePushStorage only ever touches context.filesDir.
package com.margelo.nitro.salvepush

import android.content.Context
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.io.File
import java.util.UUID

class SalvePushStorageTest {
  private lateinit var scratchDir: File
  private lateinit var context: Context

  @Before
  fun setUp() {
    scratchDir = File(System.getProperty("java.io.tmpdir"), "salve-push-tests-${UUID.randomUUID()}")
    scratchDir.mkdirs()
    context = mock<Context>()
    whenever(context.filesDir).thenReturn(scratchDir)
  }

  @After
  fun tearDown() {
    scratchDir.deleteRecursively()
  }

  @Test
  fun `installUpdate writes the bundle and updates state`() {
    SalvePushStorage.installUpdate(context, "release-a", "console.log('A')".toByteArray())

    assertEquals("release-a", SalvePushStorage.getCurrentReleaseId(context))
    assertFalse(
      "installUpdate must clear the mount marker until the app confirms boot",
      SalvePushStorage.isMounted(context),
    )
  }

  @Test
  fun `installUpdate records the previous release for rollback`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())
    SalvePushStorage.confirmBoot(context)

    SalvePushStorage.installUpdate(context, "release-b", "b".toByteArray())

    assertEquals("release-b", SalvePushStorage.getCurrentReleaseId(context))
    val path = SalvePushStorage.resolveBundlePath(context)
    assertEquals("b", path?.let { File(it).readText() })
  }

  @Test
  fun `installUpdate prunes releases other than current and previous`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())
    SalvePushStorage.confirmBoot(context)
    SalvePushStorage.installUpdate(context, "release-b", "b".toByteArray())
    SalvePushStorage.confirmBoot(context)

    SalvePushStorage.installUpdate(context, "release-c", "c".toByteArray())

    val releasesDir = File(File(scratchDir, "salve-push"), "releases")
    assertEquals(setOf("release-b", "release-c"), releasesDir.list()?.toSet())
  }

  @Test
  fun `confirmBoot marks mounted and confirmed`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())

    SalvePushStorage.confirmBoot(context)

    assertTrue(SalvePushStorage.isMounted(context))
  }

  @Test
  fun `resolveBundlePath returns null when nothing installed`() {
    assertNull(SalvePushStorage.resolveBundlePath(context))
  }

  @Test
  fun `resolveBundlePath returns the installed bundle when there is no crash marker`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())

    val path = SalvePushStorage.resolveBundlePath(context)

    assertEquals("a", path?.let { File(it).readText() })
  }

  @Test
  fun `resolveBundlePath rolls back when the crash marker requests auto-rollback`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())
    SalvePushStorage.confirmBoot(context)
    SalvePushStorage.installUpdate(context, "release-b", "b".toByteArray())
    val crashMarker = File(File(scratchDir, "salve-push"), "crash.marker")
    crashMarker.writeText("""{"signal":6,"isAutoRollback":true}""")

    SalvePushStorage.resolveBundlePath(context)

    assertEquals("release-a", SalvePushStorage.getCurrentReleaseId(context))
    assertTrue("a rolled-back release is trusted immediately", SalvePushStorage.isMounted(context))
    assertFalse(
      "the crash marker must be consumed so it isn't reprocessed on the next launch",
      crashMarker.exists(),
    )
  }

  @Test
  fun `resolveBundlePath does not roll back when the crash marker does not request it`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())
    SalvePushStorage.confirmBoot(context)
    SalvePushStorage.installUpdate(context, "release-b", "b".toByteArray())
    // A crash after boot was confirmed (isAutoRollback: false) must not revert the release.
    val crashMarker = File(File(scratchDir, "salve-push"), "crash.marker")
    crashMarker.writeText("""{"signal":11,"isAutoRollback":false}""")

    SalvePushStorage.resolveBundlePath(context)

    assertEquals("release-b", SalvePushStorage.getCurrentReleaseId(context))
  }

  @Test
  fun `rollbackToPreviousIfUnconfirmed does nothing when already mounted`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())
    SalvePushStorage.confirmBoot(context)
    SalvePushStorage.installUpdate(context, "release-b", "b".toByteArray())
    SalvePushStorage.confirmBoot(context)

    SalvePushStorage.rollbackToPreviousIfUnconfirmed(context)

    assertEquals("release-b", SalvePushStorage.getCurrentReleaseId(context))
  }

  @Test
  fun `rollbackToPreviousIfUnconfirmed reverts when boot never confirmed`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())
    SalvePushStorage.confirmBoot(context)
    SalvePushStorage.installUpdate(context, "release-b", "b".toByteArray())

    SalvePushStorage.rollbackToPreviousIfUnconfirmed(context)

    assertEquals("release-a", SalvePushStorage.getCurrentReleaseId(context))
    assertTrue(SalvePushStorage.isMounted(context))
  }

  @Test
  fun `rollbackToPreviousIfUnconfirmed is a no-op without a previous release`() {
    SalvePushStorage.installUpdate(context, "release-a", "a".toByteArray())

    SalvePushStorage.rollbackToPreviousIfUnconfirmed(context)

    assertEquals("release-a", SalvePushStorage.getCurrentReleaseId(context))
  }
}
