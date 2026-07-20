export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  password_salt: string | null;
  password_updated_at: string | null;
  email_verified_at: string | null;
  email_verification_sent_at: string | null;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  owner_user_id: string;
  billing_plan: string;
  billing_status: string;
  extra_proof_pack_allowance: number;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  paddle_price_id: string | null;
  billing_period_ends_at: string | null;
  created_at: string;
}

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
}

export interface ProofPackRow {
  id: string;
  organization_id: string;
  title: string;
  status: "draft" | "waiting_for_supplier" | "in_review" | "buyer_ready" | "archived";
  commodity: "coffee" | "cocoa" | "wood" | "rubber" | "soy" | "palm_oil" | "cattle" | "other";
  product_name: string;
  hs_code: string | null;
  quantity: string;
  batch_number: string;
  production_country: string;
  export_country: string;
  destination_country: string;
  production_date_start: string | null;
  production_date_end: string | null;
  buyer_company: string;
  buyer_contact: string;
  buyer_email: string;
  buyer_country: string;
  eori_number: string | null;
  internal_reference: string | null;
  supplier_company: string;
  supplier_contact: string;
  supplier_email: string;
  supplier_country: string;
  supplier_declaration_confirmed: number;
  risk_level: "low" | "medium" | "high" | "unknown";
  risk_notes: string | null;
  reviewer_notes: string | null;
  country_risk_notes: string | null;
  supplier_risk_notes: string | null;
  geolocation_completeness: string | null;
  missing_documents: string | null;
  open_questions: string | null;
  share_token: string | null;
  supplier_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlotRow {
  id: string;
  proof_pack_id: string;
  plot_name: string;
  producer_name: string;
  latitude: number;
  longitude: number;
  area_size: string | null;
  geojson_r2_key: string | null;
  notes: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  proof_pack_id: string;
  uploaded_by_user_id: string | null;
  document_type: string;
  original_filename: string;
  r2_key: string;
  content_type: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
}

export interface ActivityEventRow {
  id: string;
  organization_id: string;
  proof_pack_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  message: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SessionContext {
  sessionId: string;
  user: UserRow;
  organization: OrganizationRow;
  membership: OrganizationMemberRow;
}
