-- Publisher-facing lead intake API. Two tables back the /api/leads/intake
-- endpoint:
--
-- 1. publisher_api_keys — bearer credentials issued to external publishers,
--    each scoped to a center (which carries the lead_vendor used by the
--    notification triggers). Raw keys are NEVER stored; only key_hash
--    (sha256 of the raw key) is persisted. Provision example:
--
--      -- one-time, from a privileged session
--      with k as (
--        select 'pk_live_' || encode(gen_random_bytes(24), 'hex') as raw
--      )
--      insert into public.publisher_api_keys (center_id, name, key_prefix, key_hash)
--      select :center_id, :name, left(raw, 12), encode(digest(raw, 'sha256'), 'hex')
--      from k
--      returning (select raw from k) as api_key, id;
--
--    Show api_key to the admin exactly once; persist only the hash.
--
-- 2. lead_intake_api_audit — append-only trail of every request the publisher
--    API processed (accepted or rejected). Required for TCPA/DNC dispute
--    response: we capture the raw DNC service answer, the consent payload
--    (when supplied), and the resulting decision per call.

create extension if not exists pgcrypto;

create table if not exists public.publisher_api_keys (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default array['leads:intake']::text[],
  -- Per-key sliding-window cap, counted against lead_intake_api_audit.
  -- 0 disables. Override per publisher: update publisher_api_keys set
  -- rate_limit_per_minute = 120 where id = '...'.
  rate_limit_per_minute integer not null default 20,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publisher_api_keys_key_hash_key unique (key_hash),
  constraint publisher_api_keys_key_hash_format check (
    key_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint publisher_api_keys_key_prefix_format check (
    char_length(key_prefix) between 4 and 24
  ),
  constraint publisher_api_keys_name_nonempty check (
    char_length(btrim(name)) > 0
  ),
  constraint publisher_api_keys_rate_limit_bounds check (
    rate_limit_per_minute between 0 and 100
  ),
  constraint publisher_api_keys_scopes_whitelist check (
    scopes <@ array['leads:intake', 'leads:documents']::text[]
    and array_length(scopes, 1) > 0
  )
);

create index if not exists idx_publisher_api_keys_center_active
  on public.publisher_api_keys (center_id)
  where revoked_at is null;

create table if not exists public.lead_intake_api_audit (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.publisher_api_keys(id) on delete set null,
  center_id uuid references public.centers(id) on delete set null,
  lead_vendor text,
  submission_id text,
  phone_e164 text,
  decision text not null,
  reason text,
  dnc_call_status text,
  dnc_response jsonb,
  tcpa_consent jsonb,
  request_ip text,
  user_agent text,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lead_intake_api_audit_decision_check check (
    decision = any (array[
      'accepted',
      'accepted_idempotent',
      'rejected_auth',
      'rejected_validation',
      'rejected_invalid_phone',
      'rejected_dnc',
      'rejected_tcpa',
      'rejected_tcpa_consent_missing',
      'rejected_rule',
      'rejected_state',
      'rejected_dnc_service',
      'rejected_rate_limit',
      'rejected_internal'
    ])
  )
);

create index if not exists idx_lead_intake_api_audit_center_created_at
  on public.lead_intake_api_audit (center_id, created_at desc);
create index if not exists idx_lead_intake_api_audit_submission_id
  on public.lead_intake_api_audit (submission_id);
create index if not exists idx_lead_intake_api_audit_lead_id
  on public.lead_intake_api_audit (lead_id);
create index if not exists idx_lead_intake_api_audit_decision_created_at
  on public.lead_intake_api_audit (decision, created_at desc);
-- Hot path for the sliding-window rate-limit query in /api/leads/intake.
create index if not exists idx_lead_intake_api_audit_api_key_created_at
  on public.lead_intake_api_audit (api_key_id, created_at desc)
  where api_key_id is not null;

-- Both tables are managed exclusively by the publisher API (service role).
-- Enabling RLS without any policies denies anon and authenticated access;
-- the service-role client used by /api/leads/* bypasses RLS by design.
alter table public.publisher_api_keys enable row level security;
alter table public.lead_intake_api_audit enable row level security;

drop trigger if exists trg_publisher_api_keys_updated_at on public.publisher_api_keys;
create trigger trg_publisher_api_keys_updated_at
  before update on public.publisher_api_keys
  for each row execute function set_updated_at();
