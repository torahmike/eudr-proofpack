import { zipSync, strToU8 } from "fflate";
import { getDocuments, getPlots } from "../db/queries";
import type { DocumentRow, ProofPackRow } from "../db/types";
import { computeReadiness } from "../routes/score";

interface ZipBuildResult {
  bytes: Uint8Array;
  filename: string;
  skippedFiles: string[];
}

const maxZipInputBytes = 48 * 1024 * 1024;
const maxSingleFileBytes = 24 * 1024 * 1024;

export async function buildProofPackZip(env: Env, pack: ProofPackRow): Promise<ZipBuildResult> {
  const [plots, documents] = await Promise.all([getPlots(env, pack.id), getDocuments(env, pack.id)]);
  const skippedFiles: string[] = [];
  let inputBytes = 0;
  const files: Record<string, Uint8Array> = {
    "proof-pack.json": strToU8(JSON.stringify({ proofPack: exportDto(pack, plots, documents), disclaimer: "EUDR readiness support only. Not legal advice or official certification." }, null, 2)),
    "README.txt": strToU8([
      "EUDR ProofPack export",
      `Title: ${pack.title}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "This archive contains a JSON summary plus uploaded supporting documents.",
      "It supports due-diligence readiness only and is not legal advice or official certification.",
    ].join("\n")),
  };

  for (const document of documents) {
    if (document.size_bytes > maxSingleFileBytes) {
      skippedFiles.push(`${document.original_filename} (skipped: file exceeds 24 MB ZIP limit)`);
      continue;
    }
    if (inputBytes + document.size_bytes > maxZipInputBytes) {
      skippedFiles.push(`${document.original_filename} (skipped: archive exceeds 48 MB ZIP limit)`);
      continue;
    }
    const object = await env.PROOF_PACK_FILES.get(document.r2_key);
    if (!object) {
      skippedFiles.push(document.original_filename);
      continue;
    }
    const path = `documents/${safePathSegment(document.document_type)}/${safePathSegment(document.original_filename)}`;
    const bytes = new Uint8Array(await object.arrayBuffer());
    inputBytes += bytes.byteLength;
    files[path] = bytes;
  }

  if (skippedFiles.length > 0) files["missing-files.json"] = strToU8(JSON.stringify({ skippedFiles }, null, 2));
  return { bytes: zipSync(files, { level: 6 }), filename: `${safePathSegment(pack.title || "proof-pack")}-proof-pack.zip`, skippedFiles };
}

function exportDto(pack: ProofPackRow, plots: Awaited<ReturnType<typeof getPlots>>, documents: DocumentRow[]) {
  return {
    id: pack.id,
    title: pack.title,
    status: pack.status,
    commodity: pack.commodity,
    product_name: pack.product_name,
    hs_code: pack.hs_code,
    quantity: pack.quantity,
    batch_number: pack.batch_number,
    production_country: pack.production_country,
    export_country: pack.export_country,
    destination_country: pack.destination_country,
    production_date_start: pack.production_date_start,
    production_date_end: pack.production_date_end,
    buyer_company: pack.buyer_company,
    buyer_contact: pack.buyer_contact,
    buyer_email: pack.buyer_email,
    buyer_country: pack.buyer_country,
    eori_number: pack.eori_number,
    internal_reference: pack.internal_reference,
    supplier_company: pack.supplier_company,
    supplier_contact: pack.supplier_contact,
    supplier_email: pack.supplier_email,
    supplier_country: pack.supplier_country,
    supplier_declaration_confirmed: pack.supplier_declaration_confirmed,
    risk_level: pack.risk_level,
    risk_notes: pack.risk_notes,
    reviewer_notes: pack.reviewer_notes,
    country_risk_notes: pack.country_risk_notes,
    supplier_risk_notes: pack.supplier_risk_notes,
    geolocation_completeness: pack.geolocation_completeness,
    missing_documents: pack.missing_documents,
    open_questions: pack.open_questions,
    created_at: pack.created_at,
    updated_at: pack.updated_at,
    readiness: computeReadiness(pack, plots, documents),
    plots,
    documents: documents.map((document) => ({
      id: document.id,
      document_type: document.document_type,
      original_filename: document.original_filename,
      content_type: document.content_type,
      size_bytes: document.size_bytes,
      notes: document.notes,
      created_at: document.created_at,
    })),
  };
}

function safePathSegment(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "file";
}
