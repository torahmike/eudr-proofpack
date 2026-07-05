PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proof_packs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting_for_supplier', 'in_review', 'buyer_ready', 'archived')),
  commodity TEXT NOT NULL DEFAULT 'coffee',
  product_name TEXT NOT NULL DEFAULT '',
  hs_code TEXT,
  quantity TEXT NOT NULL DEFAULT '',
  batch_number TEXT NOT NULL DEFAULT '',
  production_country TEXT NOT NULL DEFAULT '',
  export_country TEXT NOT NULL DEFAULT '',
  destination_country TEXT NOT NULL DEFAULT '',
  production_date_start TEXT,
  production_date_end TEXT,
  buyer_company TEXT NOT NULL DEFAULT '',
  buyer_contact TEXT NOT NULL DEFAULT '',
  buyer_email TEXT NOT NULL DEFAULT '',
  buyer_country TEXT NOT NULL DEFAULT '',
  eori_number TEXT,
  internal_reference TEXT,
  supplier_company TEXT NOT NULL DEFAULT '',
  supplier_contact TEXT NOT NULL DEFAULT '',
  supplier_email TEXT NOT NULL DEFAULT '',
  supplier_country TEXT NOT NULL DEFAULT '',
  supplier_declaration_confirmed INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'unknown' CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')),
  risk_notes TEXT,
  reviewer_notes TEXT,
  country_risk_notes TEXT,
  supplier_risk_notes TEXT,
  geolocation_completeness TEXT,
  missing_documents TEXT,
  open_questions TEXT,
  share_token TEXT UNIQUE,
  supplier_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plots (
  id TEXT PRIMARY KEY,
  proof_pack_id TEXT NOT NULL REFERENCES proof_packs(id) ON DELETE CASCADE,
  plot_name TEXT NOT NULL,
  producer_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  area_size TEXT,
  geojson_r2_key TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  proof_pack_id TEXT NOT NULL REFERENCES proof_packs(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proof_pack_id TEXT REFERENCES proof_packs(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_members_user_id ON organization_members(user_id);
CREATE INDEX idx_proof_packs_organization_id ON proof_packs(organization_id);
CREATE INDEX idx_proof_packs_share_token ON proof_packs(share_token);
CREATE INDEX idx_proof_packs_supplier_token ON proof_packs(supplier_token);
CREATE INDEX idx_plots_proof_pack_id ON plots(proof_pack_id);
CREATE INDEX idx_documents_proof_pack_id ON documents(proof_pack_id);
CREATE INDEX idx_activity_organization_id ON activity_events(organization_id);
