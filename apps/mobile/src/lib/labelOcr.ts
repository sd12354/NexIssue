import Constants from "expo-constants";
import { requireNativeModule } from "expo";
import { Platform } from "react-native";

import { parseCgcLabel } from "./cgcLabelParser";
import type { LabelParseResult } from "./labelTypes";

export class LabelOcrUnavailableError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "Label OCR requires the NexIssue dev build on a physical iPhone (not Expo Go). Run: pnpm --filter mobile ios:device",
    );
    this.name = "LabelOcrUnavailableError";
  }
}

function isMlkitLinked(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    requireNativeModule("RNMLKitTextRecognition");
    return true;
  } catch {
    return false;
  }
}

function assertOcrAvailable(): void {
  if (Constants.appOwnership === "expo") {
    throw new LabelOcrUnavailableError(
      "Label OCR does not work in Expo Go. Open the NexIssue app installed via pnpm --filter mobile ios:device (same Wi‑Fi, Metro running).",
    );
  }
  if (!isMlkitLinked()) {
    throw new LabelOcrUnavailableError(
      "ML Kit is not linked in this build. Reinstall with: pnpm --filter mobile ios:device",
    );
  }
}

export async function runLabelOcr(imageUri: string): Promise<LabelParseResult> {
  assertOcrAvailable();

  const { recognizeText } = await import(
    "@infinitered/react-native-mlkit-text-recognition"
  );
  const ocr = await recognizeText(imageUri);
  return parseCgcLabel(ocr);
}
