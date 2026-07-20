ALTER TABLE organizations ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN paddle_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN paddle_price_id TEXT;
ALTER TABLE organizations ADD COLUMN billing_period_ends_at TEXT;

CREATE TABLE IF NOT EXISTS paddle_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  organization_id TEXT,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_paddle_webhook_events_organization ON paddle_webhook_events(organization_id);
