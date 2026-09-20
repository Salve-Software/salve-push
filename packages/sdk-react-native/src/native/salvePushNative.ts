import { NitroModules } from "react-native-nitro-modules";
import type { SalvePushNative } from "../specs/SalvePushNative.nitro";

/**
 * Native storage/install/rollback HybridObject (ADR 0004). Internal
 * implementation detail — app code uses the higher-level `SalvePush`
 * facade instead of this object directly.
 */
export const salvePushNative =
  NitroModules.createHybridObject<SalvePushNative>("SalvePushNative");
