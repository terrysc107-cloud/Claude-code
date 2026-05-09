-- Cards: manual + Plaid-linked credit/debit cards
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuer text,
  network text,
  last4 text,
  color text default '#DA7756',
  rewards_type text default 'points',   -- points | miles | cashback
  rewards_balance numeric default 0,
  rewards_updated_at timestamptz,
  plaid_account_id text,                -- optional link to Plaid account_id
  created_at timestamptz default now()
);

-- Per-card benefits with annual reset + redemption tracking
create table if not exists card_benefits (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  name text not null,
  description text,
  annual_value numeric default 0,
  reset_type text default 'calendar_year',  -- calendar_year | anniversary | monthly | quarterly
  redeemed boolean default false,
  redeemed_at timestamptz,
  redeemed_amount numeric,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists card_benefits_card_idx on card_benefits (card_id);

alter table cards enable row level security;
alter table card_benefits enable row level security;
