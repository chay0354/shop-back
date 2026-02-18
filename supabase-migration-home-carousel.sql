-- Run this in Supabase SQL Editor.
-- Creates table for home page carousel images (admin adds them; one shown every 5 sec on the home page).

create table if not exists home_carousel (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_home_carousel_sort on home_carousel(sort_order);

comment on table home_carousel is 'תמונות קרוסלת דף הבית – מוצגת תמונה אחת כל 5 שניות';
