-- Run in Supabase SQL Editor.
-- Adds "hidden" flag: when true, product is not shown in the store (admin only).

alter table products add column if not exists hidden boolean not null default false;
comment on column products.hidden is 'מוצר מוסתר – לא מוצג באתר ללקוחות';
