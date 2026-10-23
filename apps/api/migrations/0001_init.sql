create table if not exists api_token (
  token_hash text primary key,
  created_at timestamptz not null default now()
);

create table if not exists account (
  id serial primary key,
  source text not null check (source in ('pocketsmith','manual')),
  external_id text,
  institution text not null,
  name text not null,
  display_name text,
  kind text not null,
  balance_cents bigint not null default 0,
  balance_date date,
  counts_spending boolean not null,
  counts_net_worth boolean not null,
  projections text not null default 'off' check (projections in ('off','etf','mortgage')),
  is_offset boolean not null default false,
  unique (source, external_id)
);

create table if not exists transaction (
  id bigserial primary key,
  account_id int not null references account(id),
  source text not null check (source in ('pocketsmith','csv')),
  external_id text not null,
  date date not null,
  amount_cents bigint not null,
  description_raw text not null,
  payee text,
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists transaction_account_date on transaction (account_id, date desc);

create table if not exists sync_log (
  id serial primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running','ok','failed')),
  error text,
  accounts_synced int,
  transactions_upserted int
);
