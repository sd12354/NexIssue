import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

import { isVisionMaskSupported, removeBackground } from "expo-vision-mask";

/** A photo prepared for both on-screen preview and Supabase upload. */
export type PreparedCoverPhoto = {
  /** URI safe to render in <Image source={{ uri }} /> */
  previewUri: string;
  /** Local file URI of the upload-ready image (PNG or JPG). */
  uploadUri: string;
  contentType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
  width: number;
  height: number;
  /** True when iOS Vision foreground mask successfully removed the background. */
  backgroundRemoved: boolean;
  /** Reason BG removal didn't apply (only set when backgroundRemoved=false). */
  fallbackReason?: string;
};

const MAX_UPLOAD_DIMENSION = 1800;

async function downscaleIfNeeded(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  const resized = await manipulateAsync(uri, [
    { resize: { width: MAX_UPLOAD_DIMENSION } },
  ], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  return { uri: resized.uri, width: resized.width, height: resized.height };
}

/**
 * Takes a raw camera URI and returns an upload-ready cover photo.
 * Uses iOS Vision foreground mask when available, falls back to original JPG.
 *
 * Defaults to a white background (JPG) because eBay product listings
 * expect solid white. Pass `transparent: true` to get a transparent PNG.
 */
export async function prepareCoverForUpload(
  cameraUri: string,
  options: { transparent?: boolean } = {},
): Promise<PreparedCoverPhoto> {
  let fallbackReason: string | undefined;
  if (!isVisionMaskSupported()) {
    fallbackReason = "vision module not linked";
  } else {
    try {
      const masked = await removeBackground(cameraUri, {
        whiteBackground: !options.transparent,
      });
      return {
        previewUri: masked.uri,
        uploadUri: masked.uri,
        contentType: options.transparent ? "image/png" : "image/jpeg",
        extension: options.transparent ? "png" : "jpg",
        width: masked.width,
        height: masked.height,
        backgroundRemoved: true,
      };
    } catch (err) {
      fallbackReason =
        err instanceof Error ? err.message : `vision error: ${String(err)}`;
    }
  }

  const resized = await downscaleIfNeeded(cameraUri);
  return {
    previewUri: resized.uri,
    uploadUri: resized.uri,
    contentType: "image/jpeg",
    extension: "jpg",
    width: resized.width,
    height: resized.height,
    backgroundRemoved: false,
    fallbackReason,
  };
}

/** Reads a local file URI into a byte array for Supabase upload. */
export async function readCoverBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}
