alter table account drop constraint if exists account_source_check;
alter table account add constraint account_source_check check (source in ('pocketsmith','manual','coinspot','commsec'));
alter table account add column if not exists growth_bps int;
alter table account drop constraint if exists account_growth_bps_check;
alter table account add constraint account_growth_bps_check check (growth_bps between -2000 and 2000);

create table if not exists trade (
  id serial primary key,
  account_id int not null references account(id) on delete cascade,
  date date not null,
  side text not null check (side in ('buy','sell')),
  symbol text not null,
  units int not null check (units > 0),
  price_micros bigint not null check (price_micros > 0),
  brokerage_cents bigint not null check (brokerage_cents >= 0),
  total_cents bigint not null check (total_cents > 0),
  source text not null check (source in ('csv','manual')),
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists trade_account_date on trade (account_id, date);

create table if not exists price (
  symbol text not null,
  date date not null,
  close_micros bigint not null,
  primary key (symbol, date)
);

create table if not exists net_worth_snapshot (
  date date primary key,
  own_cents bigint not null,
  owe_cents bigint not null
);

create table if not exists trade_hint_dismissed (
  transaction_id bigint primary key references transaction(id) on delete cascade
);

alter table notification_pref drop constraint if exists notification_pref_type_check;
alter table notification_pref add constraint notification_pref_type_check
  check (type in ('limit','bill','paid_check','sync','stale','trade_hint'));
insert into notification_pref (type, enabled) values ('trade_hint', true) on conflict do nothing;
