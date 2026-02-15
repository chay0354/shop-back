# Product images – SQL and Storage bucket

## SQL

**You don’t need any extra SQL for product images.**

The `products` table already has an `image_url` column from the main schema (`back/supabase-schema.sql`):

```sql
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid not null references subcategories(id) on delete cascade,
  name_he text not null,
  description_he text,
  price decimal(12,2) not null default 0,
  image_url text,   -- already here
  sort_order int not null default 0,
  created_at timestamptz default now()
);
```

If your database was created from this schema, nothing else is required.  
If you added the `products` table before `image_url` existed, run:

```sql
-- Only if image_url is missing on products
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
```

---

## Storage bucket for pictures

The backend uploads product images to **Supabase Storage** in a bucket named:

- **Bucket name:** `product-images`
- **Visibility:** **Public** (so the store can show images via URL)

The backend tries to create this bucket automatically when it starts. If you see storage errors when adding a product:

1. Open **Supabase Dashboard** → **Storage**.
2. Click **New bucket**.
3. Set:
   - **Name:** `product-images`
   - **Public bucket:** **On** (so the app can use the image URLs).
4. (Optional) Under bucket settings you can set **File size limit** (e.g. 5 MB) and **Allowed MIME types** (e.g. `image/jpeg`, `image/png`, `image/webp`, `image/gif`).

After creating the bucket, try adding a product with an image again.
