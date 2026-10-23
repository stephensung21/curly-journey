alter table account add column if not exists history_from date;
alter table account add column if not exists history_done boolean not null default false;
alter table sync_log add column if not exists more boolean not null default false;
