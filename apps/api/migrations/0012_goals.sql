-- Savings goals. An empty account_ids tracks net worth; otherwise the sum of those accounts' balances.
create table if not exists goal (
  id serial primary key,
  name text not null,
  emoji text not null default '🎯',
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  account_ids int[] not null default '{}',
  created_at timestamptz not null default now()
);
