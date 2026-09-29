import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

const BUCKET = "recipe-photos";
// The browser shrinks photos before sending them, so this is a generous ceiling.
const MAX_BYTES = 3_500_000;

export class PhotoError extends Error {}

function publicPrefix(): string {
  return createAdminClient().storage.from(BUCKET).getPublicUrl("").data.publicUrl;
}

/** Saves a photo in the project's file storage and returns its public address. */
export async function storePhoto(file: unknown): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new PhotoError("Nie wybrano zdjęcia.");
  }
  if (file.type !== "image/jpeg") {
    throw new PhotoError("Nie udało się przygotować zdjęcia. Spróbuj innego pliku.");
  }
  if (file.size > MAX_BYTES) {
    throw new PhotoError("To zdjęcie jest za duże. Wybierz mniejsze.");
  }

  const storage = createAdminClient().storage;

  const bucket = await storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  if (bucket.error && !/already exists/i.test(bucket.error.message)) {
    console.error("createBucket failed:", bucket.error.message);
    throw new PhotoError("Magazyn zdjęć nie jest dostępny. Spróbuj ponownie za chwilę.");
  }

  const name = `${randomUUID()}.jpg`;
  const stored = await storage
    .from(BUCKET)
    .upload(name, Buffer.from(await file.arrayBuffer()), { contentType: "image/jpeg" });
  if (stored.error) {
    console.error("photo upload failed:", stored.error.message);
    throw new PhotoError("Nie udało się zapisać zdjęcia. Spróbuj ponownie.");
  }

  return storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

/** Deletes a photo that is no longer used. Addresses from elsewhere are left alone. */
export async function discardPhoto(address: string | null | undefined): Promise<void> {
  const prefix = publicPrefix();
  if (!address || !address.startsWith(prefix)) return;

  const name = address.slice(prefix.length).replace(/^\/+/, "");
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(name)) return;

  const removed = await createAdminClient().storage.from(BUCKET).remove([name]);
  if (removed.error) console.error("photo removal failed:", removed.error.message);
}
