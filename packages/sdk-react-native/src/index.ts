// react-native-salve-push public API (PRD §16).
import { downloadAndVerifyBundle, fetchLatestUpdate } from "./update";
import type { SalvePushConfig, UpdateInfo } from "./types";

export type { SalvePushConfig, UpdateInfo };

let config: SalvePushConfig | null = null;
let verifiedBundle: Uint8Array | null = null;

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
    verifiedBundle = await downloadAndVerifyBundle(requireConfig(), update);
  },

  async installUpdate(): Promise<void> {
    requireConfig();
    if (!verifiedBundle) {
      throw new Error("no downloaded update to install; call downloadUpdate() first");
    }
    throw new Error("not implemented: native bundle swap");
  },

  async sync(): Promise<void> {
    const update = await SalvePush.checkForUpdate();
    if (!update) return;
    await SalvePush.downloadUpdate(update);
    await SalvePush.installUpdate();
  },
};

export default SalvePush;
