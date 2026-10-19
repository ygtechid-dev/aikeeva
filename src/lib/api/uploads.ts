import { LeonardoError, uploadAsset, uploadAudioAsset } from "@/lib/leonardo/client";
import { ApiError } from "./http";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;


export async function uploadImageFile(file: File, field: string): Promise<string> {
  if (file.size === 0) {
    throw new ApiError(`File ${field} kosong.`, 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(`Gambar ${field} lebih dari 15MB.`, 413);
  }

  let extension: "jpg" | "png" | "webp";
  let mimeType: string;
  if (file.type === "image/png") {
    extension = "png";
    mimeType = "image/png";
  } else if (file.type === "image/webp") {
    extension = "webp";
    mimeType = "image/webp";
  } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
    extension = "jpg";
    mimeType = "image/jpeg";
  } else {
    throw new ApiError(`Format ${field} tidak didukung. Gunakan JPG, PNG, atau WEBP.`, 415);
  }

  try {
    const { id } = await uploadAsset(Buffer.from(await file.arrayBuffer()), extension, mimeType);
    return id;
  } catch (error) {
    if (error instanceof LeonardoError) {
      throw new ApiError(`Upload ${field} gagal: ${error.message}`, 502);
    }
    throw error;
  }
}

export async function uploadAudioFile(file: File, field: string): Promise<string> {
  if (file.size === 0) {
    throw new ApiError(`File ${field} kosong.`, 400);
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new ApiError(`Audio ${field} lebih dari 25MB.`, 413);
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  let extension: string;
  let mimeType: string;
  if (file.type === "audio/mpeg" || ext === "mp3") {
    extension = "mp3";
    mimeType = "audio/mpeg";
  } else if (file.type === "audio/wav" || ext === "wav") {
    extension = "wav";
    mimeType = "audio/wav";
  } else if (file.type === "audio/mp4" || ext === "m4a") {
    extension = "m4a";
    mimeType = "audio/mp4";
  } else if (file.type === "audio/webm" || ext === "webm") {
    extension = "webm";
    mimeType = "audio/webm";
  } else {
    throw new ApiError(`Format ${field} tidak didukung. Gunakan MP3, WAV, M4A, atau WEBM.`, 415);
  }

  try {
    const { id } = await uploadAudioAsset(Buffer.from(await file.arrayBuffer()), extension, mimeType);
    return id;
  } catch (error) {
    if (error instanceof LeonardoError) {
      throw new ApiError(`Upload ${field} gagal: ${error.message}`, 502);
    }
    throw error;
  }
}
