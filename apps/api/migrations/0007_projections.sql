create table if not exists projection_profile (
  id int primary key default 1 check (id = 1),
  birth_date date,
  tax_rate_bps int check (tax_rate_bps between 0 and 6000),
  mortgage_rate_bps int check (mortgage_rate_bps between 0 and 2000),
  repayment_cents bigint check (repayment_cents > 0),
  repayment_frequency text not null default 'monthly' check (repayment_frequency in ('weekly','fortnightly','monthly')),
  term_months int check (term_months between 1 and 600),
  offset_growth_cents bigint not null default 0,
  return_bps int not null default 700 check (return_bps between 0 and 2000),
  inflation_bps int not null default 250 check (inflation_bps between 0 and 1000),
  distribution_yield_bps int not null default 300 check (distribution_yield_bps between 0 and 1500),
  target_cents bigint not null default 100000000 check (target_cents > 0),
  target_age int not null default 60 check (target_age between 18 and 100),
  todays_dollars boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into projection_profile (id) values (1) on conflict do nothing;
