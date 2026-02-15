-- Run this in Supabase SQL Editor to create tables

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name_he text not null,
  slug text not null unique,
  sort_order int not null default 0,
  icon text
);

create table if not exists subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name_he text not null,
  slug text not null,
  sort_order int not null default 0,
  unique(category_id, slug)
);

create index if not exists idx_subcategories_category_id on subcategories(category_id);

-- Products (per subcategory)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid not null references subcategories(id) on delete cascade,
  name_he text not null,
  description_he text,
  price decimal(12,2) not null default 0,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_products_subcategory_id on products(subcategory_id);

-- Enable RLS (anon can read)
alter table categories enable row level security;
alter table subcategories enable row level security;
alter table products enable row level security;

drop policy if exists "Allow public read categories" on categories;
create policy "Allow public read categories" on categories for select using (true);
drop policy if exists "Allow public read subcategories" on subcategories;
create policy "Allow public read subcategories" on subcategories for select using (true);
drop policy if exists "Allow public read products" on products;
create policy "Allow public read products" on products for select using (true);

-- Orders (payment & delivery) – all order details stored here
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_city text not null,
  payment_method text not null,
  status text not null default 'new',
  total decimal(12,2) not null default 0,
  customer_notes text,
  express_delivery boolean not null default false,
  order_status text not null default 'not_supplied',
  delivery_time_slot text,
  created_at timestamptz default now()
);

-- Add optional columns if table already exists (run once)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'customer_notes') then
    alter table orders add column customer_notes text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'express_delivery') then
    alter table orders add column express_delivery boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'order_status') then
    alter table orders add column order_status text not null default 'not_supplied';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'delivery_time_slot') then
    alter table orders add column delivery_time_slot text;
  end if;
end $$;

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name_he text not null,
  quantity int not null default 1,
  unit_price decimal(12,2) not null,
  line_total decimal(12,2) not null,
  created_at timestamptz default now()
);

create index if not exists idx_order_items_order_id on order_items(order_id);

alter table orders enable row level security;
alter table order_items enable row level security;

drop policy if exists "Allow public insert orders" on orders;
create policy "Allow public insert orders" on orders for insert with check (true);
drop policy if exists "Allow public insert order_items" on order_items;
create policy "Allow public insert order_items" on order_items for insert with check (true);
