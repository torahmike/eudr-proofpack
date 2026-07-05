import type { DocumentRow, PlotRow, ProofPackRow } from "../db/types";

export interface ReadinessScore {
  percentage: number;
  missingItems: string[];
  suggestedNextAction: string;
}

export function computeReadiness(pack: ProofPackRow, plots: PlotRow[], documents: DocumentRow[]): ReadinessScore {
  let score = 0;
  const missingItems: string[] = [];

  if (pack.buyer_company && pack.buyer_contact && pack.buyer_email && pack.buyer_country) score += 15;
  else missingItems.push("Complete buyer/importer details");

  if (pack.commodity && pack.product_name && pack.quantity && pack.batch_number && pack.production_country && pack.export_country && pack.destination_country) score += 20;
  else missingItems.push("Complete product and batch details");

  if (pack.supplier_company && pack.supplier_email && pack.supplier_declaration_confirmed === 1) score += 15;
  else missingItems.push("Confirm supplier declaration");

  if (plots.length > 0) score += 20;
  else missingItems.push("Add at least one production plot");

  const requiredDocs = new Set(["supplier_declaration", "land_use_evidence", "chain_of_custody"]);
  const presentDocs = new Set(documents.map((document) => document.document_type));
  if ([...requiredDocs].every((doc) => presentDocs.has(doc))) score += 20;
  else missingItems.push("Upload required evidence documents");

  if (pack.risk_level !== "unknown" && (pack.risk_notes || pack.reviewer_notes)) score += 10;
  else missingItems.push("Review risk notes");

  return {
    percentage: score,
    missingItems,
    suggestedNextAction: missingItems[0] ?? "Generate and share the buyer-ready evidence pack",
  };
}
