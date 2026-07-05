const maxUploadBytes = 10 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export interface StoredFile {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export async function storeUpload(env: Env, proofPackId: string, file: File): Promise<StoredFile> {
  if (file.size > maxUploadBytes) {
    throw new Error("File exceeds the 10 MB MVP upload limit");
  }
  const contentType = file.type || "application/octet-stream";
  if (!allowedTypes.has(contentType)) {
    throw new Error("Unsupported file type");
  }
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload.bin";
  const key = `proof-packs/${proofPackId}/${crypto.randomUUID()}-${safeName}`;
  await env.PROOF_PACK_FILES.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { originalFilename: safeName },
  });
  return { key, filename: safeName, contentType, size: file.size };
}
