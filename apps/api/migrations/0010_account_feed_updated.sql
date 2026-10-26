-- When PocketSmith last updated each bank account (its updated_at), shown as "checked by PocketSmith".
alter table account add column if not exists feed_updated_at timestamptz;
