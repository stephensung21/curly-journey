-- Accounts the owner has hidden from the Accounts page. Hiding changes only that list: totals, spending
-- and net worth follow their own switches.
alter table account add column if not exists hidden boolean not null default false;
