alter table account drop constraint if exists account_source_check;
alter table account add constraint account_source_check check (source in ('pocketsmith','manual','coinspot'));
alter table account add column if not exists synced_at timestamptz;

create table if not exists spending_limit (
  id serial primary key,
  category_id int unique references category(id),
  amount_cents bigint not null check (amount_cents > 0),
  warn_percent int not null default 80 check (warn_percent between 50 and 99),
  created_at timestamptz not null default now()
);
create unique index if not exists spending_limit_one_whole_month on spending_limit ((category_id is null)) where category_id is null;

create table if not exists calendar_event (
  id serial primary key,
  name text not null,
  emoji text not null default '📅',
  amount_cents bigint check (amount_cents > 0),
  account_id int references account(id) on delete set null,
  start_date date not null,
  repeat text not null check (repeat in ('none','weekly','fortnightly','monthly','quarterly','yearly')),
  lead_days int not null default 2 check (lead_days between 0 and 14),
  on_day_alert boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists event_occurrence (
  event_id int not null references calendar_event(id) on delete cascade,
  due_date date not null,
  status text not null check (status in ('paid','skipped')),
  source text not null check (source in ('auto','user')),
  transaction_id bigint references transaction(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, due_date)
);

create table if not exists push_device (token text primary key, created_at timestamptz not null default now());

create table if not exists notification_pref (
  type text primary key check (type in ('limit','bill','paid_check','sync','stale')),
  enabled boolean not null
);
insert into notification_pref (type, enabled) values
  ('limit', true), ('bill', true), ('paid_check', true), ('sync', true), ('stale', true)
on conflict do nothing;

create table if not exists notification_log (key text primary key, sent_at timestamptz not null default now());

create table if not exists account_value (
  id serial primary key,
  account_id int not null references account(id) on delete cascade,
  as_of date not null,
  value_cents bigint not null,
  unique (account_id, as_of)
);

create table if not exists account_holding (
  account_id int not null references account(id) on delete cascade,
  symbol text not null,
  units text not null,
  aud_cents bigint not null,
  primary key (account_id, symbol)
);

insert into calendar_event (name, emoji, start_date, repeat)
select 'Mortgage repayment', '🏦', date '2026-10-28', 'monthly'
where not exists (select 1 from calendar_event where name = 'Mortgage repayment');
insert into calendar_event (name, emoji, start_date, repeat)
select 'Amex statement closes', '💳', date '2026-10-25', 'monthly'
where not exists (select 1 from calendar_event where name = 'Amex statement closes');
