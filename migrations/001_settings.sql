-- Settings key-value store (for admin-editable options like express daily limit).
-- Run this in your Supabase SQL editor if the table does not exist.

create table if not exists settings (
  key   text primary key,
  value text not null default ''
);

-- Optional: set initial express daily limit (default used by app is 5 if no row).
-- insert into settings (key, value) values ('express_daily_limit', '5')
-- on conflict (key) do nothing;
