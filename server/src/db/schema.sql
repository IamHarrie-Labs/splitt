BEGIN;
CREATE TABLE IF NOT EXISTS owners (id uuid PRIMARY KEY, wallet_address text NOT NULL UNIQUE, email text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id), name text NOT NULL, client_name text NOT NULL, client_wallet text NOT NULL,
  onchain_id text NOT NULL UNIQUE, reserve_micro bigint NOT NULL CHECK (reserve_micro >= 0), max_per_payment_micro bigint NOT NULL CHECK (max_per_payment_micro > 0),
  max_per_day_micro bigint NOT NULL CHECK (max_per_day_micro >= max_per_payment_micro), policy_version bigint NOT NULL CHECK (policy_version > 0),
  source text NOT NULL CHECK (source IN ('fixture','pilot_mirrored','pilot_real','fault_injection')), status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoices (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), reference text NOT NULL, total_micro bigint NOT NULL CHECK (total_micro > 0), received_micro bigint NOT NULL DEFAULT 0 CHECK (received_micro >= 0), due_date date NOT NULL, status text NOT NULL CHECK (status IN ('open','partial','paid','void')), UNIQUE(project_id, reference));
CREATE TABLE IF NOT EXISTS documents (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), kind text NOT NULL, filename text NOT NULL, text_content text NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS commitments (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), onchain_id text NOT NULL UNIQUE, payee_name text NOT NULL, payee_address text NOT NULL,
  max_micro bigint NOT NULL CHECK (max_micro > 0), paid_micro bigint NOT NULL DEFAULT 0 CHECK (paid_micro >= 0 AND paid_micro <= max_micro),
  due_date date NOT NULL, defer_until date, partial_allowed boolean NOT NULL DEFAULT false, work_status text NOT NULL CHECK (work_status IN ('pending','accepted')),
  blocks_next_delivery boolean NOT NULL DEFAULT false, depends_on uuid REFERENCES commitments(id), accepted_at timestamptz, status text NOT NULL,
  terms_excerpt text, source_document_id uuid REFERENCES documents(id), share_token text UNIQUE
);
CREATE TABLE IF NOT EXISTS inbound_payments (
  id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), invoice_id uuid REFERENCES invoices(id), tx_hash text NOT NULL, log_index integer NOT NULL,
  chain_id bigint NOT NULL, payer text NOT NULL, amount_micro bigint NOT NULL CHECK (amount_micro > 0), route text NOT NULL CHECK (route IN ('deposit','transfer','cctp')),
  attribution text NOT NULL CHECK (attribution IN ('confirmed','candidate','ambiguous','rejected')), attribution_id text UNIQUE, confirmed_by uuid REFERENCES owners(id),
  evidence_hash text, source_burn_tx text, intent_id uuid, source text NOT NULL, UNIQUE(chain_id, tx_hash, log_index)
);
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), trigger_payment_id uuid REFERENCES inbound_payments(id), policy_version bigint NOT NULL,
  facts_json jsonb NOT NULL, facts_hash text NOT NULL, plan_hash text NOT NULL, model text NOT NULL, status text NOT NULL,
  model_output_json jsonb NOT NULL, validator_report_json jsonb NOT NULL, fallback_used boolean NOT NULL, approval_deadline bigint, owner_signature text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_execution_per_project ON plans(project_id) WHERE status IN ('executing','unresolved');
CREATE TABLE IF NOT EXISTS plan_items (
  id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES plans(id), commitment_id uuid NOT NULL REFERENCES commitments(id), action text NOT NULL CHECK (action IN ('pay','defer')),
  amount_micro bigint NOT NULL CHECK (amount_micro >= 0), reason_codes text[] NOT NULL, fact_refs text[] NOT NULL, explanation text NOT NULL,
  execution_id text UNIQUE, exec_status text NOT NULL, tx_hash text, circle_tx_id text, UNIQUE(plan_id, commitment_id)
);
CREATE TABLE IF NOT EXISTS escalations (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), kind text NOT NULL, detail_json jsonb NOT NULL, status text NOT NULL DEFAULT 'open', resolution text);
CREATE TABLE IF NOT EXISTS drafts (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), plan_id uuid NOT NULL REFERENCES plans(id), audience text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'draft');
CREATE TABLE IF NOT EXISTS ledger (id bigserial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES projects(id), event text NOT NULL, payload_json jsonb NOT NULL, prev_hash text NOT NULL, hash text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS chain_cursors (chain_id bigint PRIMARY KEY, block_number bigint NOT NULL, block_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS auth_nonces (nonce text PRIMARY KEY, wallet_address text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz);
COMMIT;
