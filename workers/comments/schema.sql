CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  parent_id TEXT,
  author_type TEXT NOT NULL CHECK (author_type IN ('visitor', 'author')),
  display_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  author_email TEXT,
  ip_hash TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_public
  ON comments (path, status, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments (parent_id, created_at);

CREATE TABLE IF NOT EXISTS comment_rate_limits (
  bucket TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket, ip_hash, action)
);
