-- Run this in Supabase SQL Editor.
-- Adds optional image_url to categories and subcategories (for admin-uploaded photos).
-- Does NOT change existing rows – new columns are nullable.

alter table categories add column if not exists image_url text;
comment on column categories.image_url is 'תמונה אופציונלית לקטגוריה (מהאדמין)';

alter table subcategories add column if not exists image_url text;
comment on column subcategories.image_url is 'תמונה אופציונלית לתת־קטגוריה (מהאדמין)';
