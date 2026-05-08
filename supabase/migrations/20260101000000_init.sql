-- Initial schema for the Claude Code finance dashboard

create table if not exists plaid_tokens (
  id uuid primary key default gen_random_uuid(),
  item_id text unique not null,
  access_token text not null,
  cursor text default '',
  last_sync timestamptz,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_id text unique not null,
  account_id text,
  date date,
  authorized_date date,
  name text,
  merchant_name text,
  amount numeric,
  iso_currency_code text,
  pending boolean default false,
  payment_channel text,
  category_primary text,
  category_detailed text,
  sync_time timestamptz,
  created_at timestamptz default now()
);

-- Indexes for common query patterns
create index if not exists transactions_date_idx on transactions (date desc);
create index if not exists transactions_pending_idx on transactions (pending);
create index if not exists transactions_category_idx on transactions (category_primary);
create index if not exists transactions_merchant_idx on transactions (merchant_name);

-- RLS: these tables contain sensitive financial data
alter table plaid_tokens enable row level security;
alter table transactions enable row level security;

-- Edge functions use the service role key and bypass RLS
-- No public-facing policies needed
