// Public product facade (PRD §16): configure/checkForUpdate/downloadUpdate/installUpdate/sync.
import { downloadAndVerifyBundle, fetchLatestUpdate } from "./update";
import { salvePushNative } from "./native/salvePushNative";
import type { SalvePushConfig, UpdateInfo } from "./types";

let config: SalvePushConfig | null = null;
let verifiedBundle: Uint8Array | null = null;
let verifiedBundleReleaseId: string | null = null;

function requireConfig(): SalvePushConfig {
  if (!config) {
    throw new Error("SalvePush.configure() must be called before using the SDK");
  }
  return config;
}

export const SalvePush = {
  configure(next: SalvePushConfig): void {
    config = next;
  },

  async checkForUpdate(): Promise<UpdateInfo | null> {
    return fetchLatestUpdate(requireConfig());
  },

  async downloadUpdate(update: UpdateInfo): Promise<void> {
    requireConfig();
    verifiedBundle = await downloadAndVerifyBundle(requireConfig(), update);
    verifiedBundleReleaseId = update.id;
  },

  async installUpdate(): Promise<void> {
    requireConfig();
    if (!verifiedBundle || !verifiedBundleReleaseId) {
      throw new Error("no downloaded update to install; call downloadUpdate() first");
    }
    await salvePushNative.installUpdate(verifiedBundleReleaseId, verifiedBundle.buffer as ArrayBuffer);
    verifiedBundle = null;
    verifiedBundleReleaseId = null;
  },

  /**
   * Confirms the currently running release booted successfully. Call this
   * once, early, after the app has rendered — see ADR 0004 for why this is
   * required for crash-loop rollback to work.
   */
  async notifyAppReady(): Promise<void> {
    await salvePushNative.notifyAppReady();
  },

  /** Convenience wrapper: check → download → install in one call. */
  async sync(): Promise<void> {
    const update = await SalvePush.checkForUpdate();
    if (!update) return;
    await SalvePush.downloadUpdate(update);
    await SalvePush.installUpdate();
  },
};
