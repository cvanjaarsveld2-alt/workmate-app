// iPhone HEIC photos → JPEG, so the AI can read them (it doesn't take HEIC).
// Shared by inbound-email and mail-agent (the two copies must stay the same).
// Only the copy sent to the AI is converted; the original file is kept.
import { Buffer } from "node:buffer";
import { base64ToBytes } from "./documents.js";

const MAX_HEIC_BYTES = 8 * 1024 * 1024;

export async function heicAsJpeg(file) {
  if (file?.ext !== "heic" || !file.content || (file.size || 0) > MAX_HEIC_BYTES) return null;
  try {
    const { default: convert } = await import("npm:heic-convert@2.1.0");
    const jpeg = await convert({ buffer: Buffer.from(base64ToBytes(file.content)), format: "JPEG", quality: 0.8 });
    return { ...file, ext: "jpg", contentType: "image/jpeg", content: Buffer.from(jpeg).toString("base64") };
  } catch (e) {
    console.error("heic: couldn't convert", String(e));
    return null;
  }
}
