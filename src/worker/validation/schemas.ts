import { z } from "zod";

export const commodities = ["coffee", "cocoa", "wood", "rubber", "soy", "palm_oil", "cattle", "other"] as const;
export const statuses = ["draft", "waiting_for_supplier", "in_review", "buyer_ready", "archived"] as const;
export const riskLevels = ["low", "medium", "high", "unknown"] as const;

const optionalText = z.string().trim().max(2000).optional().nullable();
const email = z.string().trim().email().max(320);
const password = z.string().min(12).max(256);

export const loginSchema = z.object({
  email,
  password,
  name: z.string().trim().max(120).optional(),
  organizationName: z.string().trim().max(160).optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(256),
});

export const proofPackCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  commodity: z.enum(commodities).default("coffee"),
});

export const proofPackPatchSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  status: z.enum(statuses).optional(),
  commodity: z.enum(commodities).optional(),
  product_name: z.string().trim().max(180).optional(),
  hs_code: optionalText,
  quantity: z.string().trim().max(120).optional(),
  batch_number: z.string().trim().max(160).optional(),
  production_country: z.string().trim().max(120).optional(),
  export_country: z.string().trim().max(120).optional(),
  destination_country: z.string().trim().max(120).optional(),
  production_date_start: optionalText,
  production_date_end: optionalText,
  buyer_company: z.string().trim().max(180).optional(),
  buyer_contact: z.string().trim().max(160).optional(),
  buyer_email: z.string().trim().email().max(320).or(z.literal("")).optional(),
  buyer_country: z.string().trim().max(120).optional(),
  eori_number: optionalText,
  internal_reference: optionalText,
  supplier_company: z.string().trim().max(180).optional(),
  supplier_contact: z.string().trim().max(160).optional(),
  supplier_email: z.string().trim().email().max(320).or(z.literal("")).optional(),
  supplier_country: z.string().trim().max(120).optional(),
  supplier_declaration_confirmed: z.boolean().optional(),
  risk_level: z.enum(riskLevels).optional(),
  risk_notes: optionalText,
  reviewer_notes: optionalText,
  country_risk_notes: optionalText,
  supplier_risk_notes: optionalText,
  geolocation_completeness: optionalText,
  missing_documents: optionalText,
  open_questions: optionalText,
});

export const plotSchema = z.object({
  plot_name: z.string().trim().min(1).max(160),
  producer_name: z.string().trim().min(1).max(160),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  area_size: optionalText,
  notes: optionalText,
});

export const documentMetaSchema = z.object({
  document_type: z.enum(["supplier_declaration", "land_use_evidence", "harvest_records", "chain_of_custody", "transport_docs", "certification", "other"]),
  notes: optionalText,
});

export const supplierUpdateSchema = proofPackPatchSchema.pick({
  supplier_company: true,
  supplier_contact: true,
  supplier_email: true,
  supplier_country: true,
  supplier_declaration_confirmed: true,
  supplier_risk_notes: true,
  open_questions: true,
});

export type ProofPackPatch = z.infer<typeof proofPackPatchSchema>;


export const feedbackSchema = z.object({
  category: z.enum(["idea", "bug", "confusing", "praise"]).default("idea"),
  message: z.string().trim().min(3).max(2000),
  email: z.string().trim().email().max(320).optional(),
  path: z.string().trim().max(2048).optional(),
});