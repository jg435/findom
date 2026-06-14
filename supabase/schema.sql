create table if not exists rules (
  id uuid default gen_random_uuid() primary key,
  description text not null,
  enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  lithic_token text unique not null,
  merchant_descriptor text,
  merchant_mcc text,
  amount_cents integer not null,
  decision text check (decision in ('APPROVE', 'DECLINE')) not null,
  ai_reason text,
  created_at timestamptz default now()
);

create index if not exists transactions_created_at_idx on transactions(created_at desc);
