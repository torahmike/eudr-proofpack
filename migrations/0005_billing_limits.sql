ALTER TABLE organizations ADD COLUMN billing_plan TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE organizations ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN extra_proof_pack_allowance INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_organizations_billing_plan ON organizations(billing_plan);