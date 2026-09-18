import type { HybridObject } from "react-native-nitro-modules";

/**
 * Native storage, bundle-swap staging and crash-loop rollback bookkeeping
 * for `react-native-salve-push` (ADR 0004).
 *
 * This is an internal implementation detail: app code should not create
 * this HybridObject directly. Use the higher-level `SalvePush` facade
 * (`installUpdate`/`notifyAppReady`), which wraps it.
 *
 * `bundleURL()` (iOS) / `getJSBundleFile()` (Android) resolution itself is
 * plain native-native code outside this spec — the JS runtime does not
 * exist yet at that point in the app lifecycle, so it cannot go through
 * JSI/Nitro at all.
 */
export interface SalvePushNative
  extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  /**
   * Writes `bundle` to on-device storage for `releaseId` (temp file, then
   * atomic rename), then promotes it to the active release with its boot
   * marked unconfirmed. Takes effect on the next app launch.
   *
   * @param releaseId The release identifier this bundle belongs to.
   * @param bundle Raw bytes of the verified bundle (see `downloadUpdate`).
   */
  installUpdate(releaseId: string, bundle: ArrayBuffer): Promise<void>;

  /**
   * Confirms the current boot succeeded. Call this once, early, after the
   * app has rendered successfully. Until this is called, a crash is
   * treated as a failed update and the previous release is restored
   * automatically on the next launch (or immediately, for a same-session
   * JS crash).
   */
  notifyAppReady(): Promise<void>;

  /**
   * The release identifier currently active, or `""` if no update has
   * been installed yet (the app is still running its embedded bundle).
   */
  getCurrentReleaseId(): string;
}
