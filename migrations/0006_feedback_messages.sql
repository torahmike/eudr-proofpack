CREATE TABLE IF NOT EXISTS feedback_messages (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('idea', 'bug', 'confusing', 'praise')),
  message TEXT NOT NULL,
  email TEXT,
  path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_created_at ON feedback_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_category ON feedback_messages(category);