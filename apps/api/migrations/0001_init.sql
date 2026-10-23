create table if not exists api_token (
  token_hash text primary key,
  created_at timestamptz not null default now()
);
