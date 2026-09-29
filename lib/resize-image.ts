const MAX_SIDE = 1600;
const QUALITY = 0.85;

/**
 * Shrinks a photo in the browser before it is sent. Phone photos are several
 * megabytes; a recipe page needs a fraction of that.
 */
export async function resizeImage(file: File): Promise<File> {
  // Also turns the picture the right way up when the phone stored it rotated.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  // JPEG has no transparency; without this, see-through areas would turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("Could not encode the photo");

  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
