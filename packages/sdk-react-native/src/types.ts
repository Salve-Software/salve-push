// Public config and update shapes for react-native-salve-push (PRD §16).
export interface SalvePushConfig {
  serverUrl: string;
  channel: string;
  runtimeVersion: string;
  platform: "ios" | "android";
  signingPublicKey: string;
}

export interface UpdateInfo {
  id: string;
  version: string;
  platform: string;
  channel: string;
  runtimeVersion: string;
  bundleHash: string;
  signature: string;
  size: number;
}
