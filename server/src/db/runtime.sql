BEGIN;
-- Additive migration: keep relational money columns and the audit trail queryable.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS balance_micro bigint NOT NULL DEFAULT 0 CHECK (balance_micro >= 0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS spent_today_micro bigint NOT NULL DEFAULT 0 CHECK (spent_today_micro >= 0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unresolved boolean NOT NULL DEFAULT false;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '';
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS active_after bigint NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS baseline_json jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS approval_json jsonb;
ALTER TABLE inbound_payments ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES owners(id);
ALTER TABLE inbound_payments ADD COLUMN IF NOT EXISTS invoice_reference text NOT NULL DEFAULT '';
ALTER TABLE inbound_payments ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS public_id uuid UNIQUE;
ALTER TABLE auth_nonces ADD COLUMN IF NOT EXISTS message text;
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY, wallet_address text NOT NULL, csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT '';
COMMIT;
