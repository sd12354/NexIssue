import { Platform } from "react-native";

type ExpoVisionMaskNativeModule = {
  isSupported(): boolean;
  removeBackground(input: {
    sourceUri: string;
    /** When true, replaces background with white (good for eBay). Otherwise transparent PNG. */
    whiteBackground?: boolean;
  }): Promise<{ uri: string; width: number; height: number }>;
};

let nativeModule: ExpoVisionMaskNativeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireNativeModule } = require("expo");
  nativeModule = requireNativeModule(
    "ExpoVisionMask",
  ) as ExpoVisionMaskNativeModule;
} catch {
  nativeModule = null;
}

export function isVisionMaskSupported(): boolean {
  if (Platform.OS !== "ios") return false;
  if (!nativeModule) return false;
  try {
    return nativeModule.isSupported();
  } catch {
    return false;
  }
}

export type RemoveBackgroundResult = {
  uri: string;
  width: number;
  height: number;
};

export async function removeBackground(
  sourceUri: string,
  options: { whiteBackground?: boolean } = {},
): Promise<RemoveBackgroundResult> {
  if (!nativeModule) {
    throw new Error("Vision mask native module is not linked.");
  }
  return nativeModule.removeBackground({
    sourceUri,
    whiteBackground: options.whiteBackground ?? false,
  });
}
