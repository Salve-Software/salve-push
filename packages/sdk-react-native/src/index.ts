// react-native-salve-push
//
// Public API surface follows the MVP PRD (section 16). Implementation of
// each step (native storage, hash/signature verification, bundle swap) is
// intentionally left for the SDK milestone — this establishes the shape
// consumers and the CLI/server team can already build against.

export interface SalvePushConfig {
  serverUrl: string;
  channel: string;
  runtimeVersion: string;
}

export interface UpdateInfo {
  id: string;
  version: string;
  bundleHash: string;
  size: number;
}

let config: SalvePushConfig | null = null;

function requireConfig(): SalvePushConfig {
  if (!config) {
    throw new Error(
      "SalvePush.configure() must be called before using the SDK"
    );
  }
  return config;
}

export const SalvePush = {
  configure(next: SalvePushConfig): void {
    config = next;
  },

  async checkForUpdate(): Promise<UpdateInfo | null> {
    requireConfig();
    throw new Error("not implemented");
  },

  async downloadUpdate(_update: UpdateInfo): Promise<void> {
    requireConfig();
    throw new Error("not implemented");
  },

  async installUpdate(): Promise<void> {
    requireConfig();
    throw new Error("not implemented");
  },

  /** Convenience wrapper: check → download → install in one call. */
  async sync(): Promise<void> {
    const update = await SalvePush.checkForUpdate();
    if (!update) return;
    await SalvePush.downloadUpdate(update);
    await SalvePush.installUpdate();
  },
};

export default SalvePush;
