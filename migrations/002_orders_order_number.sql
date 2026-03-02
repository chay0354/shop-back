-- Add display order number (62021, 62022, ...). Run in Supabase SQL editor.

alter table orders
  add column if not exists order_number integer null;

-- Ensure uniqueness so each order gets a different number (and retries work).
create unique index if not exists orders_order_number_key on orders (order_number) where order_number is not null;

-- Optional: backfill existing orders with a range (uncomment and adjust start number if needed).
-- with numbered as (
--   select id, row_number() over (order by created_at) as rn from orders where order_number is null
-- )
-- update orders set order_number = 62019 + numbered.rn from numbered where orders.id = numbered.id;