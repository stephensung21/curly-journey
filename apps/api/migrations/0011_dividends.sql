-- Dividends and ETF distributions paid into bank accounts. Deposits naming a held ETF are counted
-- automatically; anything put in this category counts too.
insert into category (name, emoji, color, kind, sort)
select 'Dividends', '🌱', 'lime', 'income', coalesce(max(sort), 0) + 1 from category
on conflict (name) do nothing;
