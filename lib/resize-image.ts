// Copied from gc3274/hw1@3eb3337 lib/resize-image.ts; keep in sync
import { IMAGE_MAX_BYTES } from "@/lib/captions";

// Browser only. Every error resizeToJpeg throws has a message that's safe to show.
export class PhotoError extends Error {}

const UNREADABLE = "Couldn’t read that photo. Try a JPG, PNG or HEIC.";

// Chrome often reports HEIC files with an empty type, so the extension counts too
export function looksLikeHeic(file: File) {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function isImageFile(file: File) {
  return file.type.startsWith("image/") || looksLikeHeic(file);
}

// Desktop Chrome and Firefox can't decode HEIC (iPhone photos), so those go
// through a WebAssembly decoder that only loads when one is picked
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    if (!looksLikeHeic(file)) throw err;
    const { heicTo } = await import("heic-to/next");
    return heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
  }
}
const PREPARE_FAILED = "Couldn’t prepare that photo. Please try another one.";

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoError(PREPARE_FAILED))),
      "image/jpeg",
      quality,
    );
  });
}

// Re-encodes any photo the browser can decode as a JPEG with its longest side
// at most maxSide. Uploads stay small, EXIF rotation is baked into the pixels,
// and the server only ever sees one format.
export async function resizeToJpeg(file: File, maxSide = 1600): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new PhotoError(UNREADABLE);
  }

  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError(PREPARE_FAILED);

    // JPEG has no transparency, so see-through PNG areas would otherwise turn black
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob = await toJpeg(canvas, 0.85);
    if (blob.size > IMAGE_MAX_BYTES) blob = await toJpeg(canvas, 0.7);
    if (blob.size > IMAGE_MAX_BYTES) {
      throw new PhotoError("That photo is too large to upload. Please try another one.");
    }
    return blob;
  } catch (err) {
    // Canvas failures (e.g. running out of memory on a huge photo) get a friendly message too
    throw err instanceof PhotoError ? err : new PhotoError(PREPARE_FAILED);
  } finally {
    bitmap.close();
  }
}
