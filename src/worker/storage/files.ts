const maxUploadBytes = 10 * 1024 * 1024;

const contentTypesByExtension = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["txt", "text/plain"],
  ["json", "application/json"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

export interface StoredFile {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export async function storeUpload(env: Env, proofPackId: string, file: File): Promise<StoredFile> {
  if (file.size <= 0) throw new Error("File is empty");
  if (file.size > maxUploadBytes) throw new Error("File exceeds the 10 MB upload limit");

  const asciiName = file.name.replace(/[^\x20-\x7E]/g, "_");
  const safeName = asciiName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload.bin";
  const extension = safeName.split(".").pop()?.toLowerCase() ?? "";
  const expectedType = contentTypesByExtension.get(extension);
  if (!expectedType) throw new Error("Unsupported file extension");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesContent(bytes, expectedType)) throw new Error("File content does not match the declared file type");

  const key = `proof-packs/${proofPackId}/${crypto.randomUUID()}-${safeName}`;
  await env.PROOF_PACK_FILES.put(key, bytes, {
    httpMetadata: { contentType: expectedType },
    customMetadata: { originalFilename: safeName },
  });
  return { key, filename: safeName, contentType: expectedType, size: file.size };
}

function matchesContent(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (contentType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (contentType.includes("wordprocessingml") || contentType.includes("spreadsheetml")) return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (contentType === "application/json") return isUtf8Text(bytes) && canParseJson(bytes);
  if (contentType === "text/plain") return isUtf8Text(bytes);
  return false;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !bytes.includes(0);
  } catch {
    return false;
  }
}

function canParseJson(bytes: Uint8Array): boolean {
  try {
    JSON.parse(new TextDecoder().decode(bytes));
    return true;
  } catch {
    return false;
  }
}