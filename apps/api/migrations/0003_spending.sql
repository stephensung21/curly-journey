create table if not exists category (
  id serial primary key,
  name text not null unique,
  emoji text not null,
  color text not null,
  kind text not null check (kind in ('spending','income')),
  sort int not null
);

insert into category (name, emoji, color, kind, sort) values
  ('Groceries', '🛒', 'lime', 'spending', 1),
  ('Dining out', '🍜', 'orange', 'spending', 2),
  ('Coffee', '☕', 'orange', 'spending', 3),
  ('Transport', '🚗', 'yellow', 'spending', 4),
  ('Shopping', '🛍️', 'pink', 'spending', 5),
  ('Bills & utilities', '💡', 'blue', 'spending', 6),
  ('Entertainment', '🎬', 'purple', 'spending', 7),
  ('Subscriptions', '📺', 'pink', 'spending', 8),
  ('Health', '🏥', 'blue', 'spending', 9),
  ('Home', '🏠', 'blue', 'spending', 10),
  ('Insurance', '🛡️', 'blue', 'spending', 11),
  ('Personal care', '💇', 'pink', 'spending', 12),
  ('Education', '🎓', 'purple', 'spending', 13),
  ('Travel', '✈️', 'yellow', 'spending', 14),
  ('Gifts & donations', '🎁', 'pink', 'spending', 15),
  ('Pets', '🐾', 'yellow', 'spending', 16),
  ('Fees & interest', '🏦', 'purple', 'spending', 17),
  ('Cash', '💵', 'lime', 'spending', 18),
  ('Government & tax', '🏛️', 'purple', 'spending', 19),
  ('Other spending', '📦', 'line', 'spending', 20),
  ('Income', '💰', 'lime', 'income', 21)
on conflict (name) do nothing;

create table if not exists rule (
  id serial primary key,
  origin text not null check (origin in ('user','learned')),
  match_text text not null,
  account_id int null references account(id) on delete cascade,
  amount_cents bigint null,
  category_id int null references category(id),
  flow text null check (flow in ('normal','transfer','mortgage','not_spending')),
  created_at timestamptz not null default now(),
  check (category_id is not null or flow is not null)
);

create table if not exists transaction_split (
  id bigserial primary key,
  transaction_id bigint not null references transaction(id) on delete cascade,
  category_id int not null references category(id),
  amount_cents bigint not null
);

alter table transaction add column if not exists merchant text not null default '';
alter table transaction add column if not exists ps_category text;
alter table transaction add column if not exists category_id int references category(id);
alter table transaction add column if not exists category_source text;
alter table transaction add column if not exists initial_source text;
alter table transaction add column if not exists categorised boolean not null default false;
alter table transaction add column if not exists flow text not null default 'normal' check (flow in ('normal','transfer','mortgage','not_spending'));
alter table transaction add column if not exists flow_source text not null default 'auto' check (flow_source in ('auto','user','rule'));
alter table transaction add column if not exists pair_id bigint;
alter table transaction add column if not exists note text;
alter table transaction add column if not exists memo text;
-- When PocketSmith first received the row: the bank feed gives only a date, so this is the closest thing to a time.
alter table transaction add column if not exists feed_created_at timestamptz;

create index if not exists transaction_date on transaction (date);

-- Next page of a history window that ran out of budget mid-way, so the next run resumes instead of restarting.
alter table account add column if not exists history_cursor text;
