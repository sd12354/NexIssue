import type { Tables, TablesInsert } from "types";
import type { NexIssueSupabaseClient } from "../client";

export type Photo = Tables<"photos">;
export type PhotoInsert = TablesInsert<"photos">;

export const COMIC_PHOTOS_BUCKET = "comic-photos";

export type PhotoPosition = "front" | "back" | "slab" | "other";

export type UploadComicPhotoOptions = {
  orgId: string;
  comicId: string;
  position: PhotoPosition;
  body: ArrayBuffer | Blob | Uint8Array;
  contentType: string;
  /** Used for the storage object suffix; e.g. "png" or "jpg". */
  extension?: string;
};

function randomId(): string {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toUploadBody(
  body: ArrayBuffer | Blob | Uint8Array,
  _contentType: string,
): Blob | ArrayBuffer {
  if (typeof Blob !== "undefined" && body instanceof Blob) return body;
  if (body instanceof Uint8Array) {
    // React Native's Blob does NOT accept ArrayBuffer/ArrayBufferView payloads
    // ("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported").
    // Pass the underlying ArrayBuffer directly — supabase-storage-js → fetch
    // accepts it natively on both web and RN.
    if (body.byteOffset === 0 && body.byteLength === body.buffer.byteLength) {
      return body.buffer as ArrayBuffer;
    }
    return body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;
  }
  return body;
}

export async function uploadComicPhoto(
  client: NexIssueSupabaseClient,
  options: UploadComicPhotoOptions,
): Promise<Photo> {
  const ext = options.extension ?? extensionFromMime(options.contentType);
  const path = `${options.orgId}/${options.comicId}/${options.position}-${randomId()}.${ext}`;

  const uploadBody = toUploadBody(options.body, options.contentType);

  const { error: uploadError } = await client.storage
    .from(COMIC_PHOTOS_BUCKET)
    .upload(path, uploadBody, {
      contentType: options.contentType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from("photos")
    .insert({
      org_id: options.orgId,
      comic_id: options.comicId,
      storage_path: path,
      position: options.position,
    } satisfies PhotoInsert)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listPhotos(
  client: NexIssueSupabaseClient,
  orgId: string,
  comicId: string,
): Promise<Photo[]> {
  const { data, error } = await client
    .from("photos")
    .select("*")
    .eq("org_id", orgId)
    .eq("comic_id", comicId)
    .order("uploaded_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createSignedPhotoUrl(
  client: NexIssueSupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await client.storage
    .from(COMIC_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Deletes every storage object for the given comic. The `photos` table rows
 * are cascade-deleted by the database when the parent comic is removed, but
 * Supabase storage objects must be removed explicitly so the bucket doesn't
 * leak files.
 */
export async function deleteComicPhotos(
  client: NexIssueSupabaseClient,
  orgId: string,
  comicId: string,
): Promise<void> {
  const { data, error } = await client
    .from("photos")
    .select("storage_path")
    .eq("org_id", orgId)
    .eq("comic_id", comicId);
  if (error) throw error;
  const paths = (data ?? []).map((row) => row.storage_path);
  if (paths.length === 0) return;
  const { error: removeError } = await client.storage
    .from(COMIC_PHOTOS_BUCKET)
    .remove(paths);
  if (removeError) throw removeError;
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}
