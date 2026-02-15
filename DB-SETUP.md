# What to do in the DB (Supabase)

Follow these steps **once** to create tables and load categories, subcategories, and products.

---

## Step 1: Open Supabase SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project (**byaehiiuluosxvjwmiin**).
3. In the left sidebar, click **SQL Editor**.

---

## Step 2: Create the tables

1. Click **New query**.
2. Copy the **entire** contents of the file `back/supabase-schema.sql` (from this project).
3. Paste into the SQL editor.
4. Click **Run** (or press Ctrl+Enter).

You should see: **Success. No rows returned.**

This creates:

- **categories** – name_he, slug, sort_order, icon  
- **subcategories** – category_id, name_he, slug, sort_order  
- **products** – subcategory_id, name_he, description_he, price, image_url, sort_order  
- **orders** – customer_name, customer_phone, delivery_address, delivery_city, payment_method, status, total, customer_notes, **express_delivery**, **order_status**  
- **order_items** – order_id, product_id, product_name_he, quantity, unit_price, line_total  

and enables read access + insert for orders/order_items (for checkout).  
**express_delivery** = משלוח אקספרס (boolean). **order_status** = סטטוס הזמנה באדמין: `not_supplied` (הזמנה לא סופקה) או `supplied` (הזמנה סופקה).

---

## Step 3: Seed data from your machine

Run the seed script so the DB is filled with categories, subcategories, and sample products:

```bash
cd back
npm run seed
```

You should see something like:

- `Inserted 9 categories` (or "Categories already exist...")
- `Inserted … subcategories`
- `Inserted … products`
- `Seed done.`

If the **products** table was created **after** you had already run the seed once, run `npm run seed` again; it will skip categories/subcategories and only insert products if the table is empty.

---

## Step 4: Check in Supabase (optional)

1. In the dashboard go to **Table Editor**.
2. Open **categories** – you should see 9 rows (משקאות, פארם וטיפוח, המזווה, and so on).
3. Open **subcategories** – multiple rows linked to categories.
4. Open **products** – many rows with name_he, price, linked to subcategories.

---

## Summary

| Step | Where | Action |
|------|--------|--------|
| 1 | Supabase → SQL Editor | Run `back/supabase-schema.sql` once |
| 2 | Your PC → `back` folder | Run `npm run seed` (once, or again if you just added the products table) |

After that, the backend API (`/api/store`, `/api/products`, etc.) will return categories, subcategories, and products from the DB.

---

## If you already have `orders` and need the new columns

If the **orders** table already existed before **express_delivery** and **order_status** were added to the schema, run this in the SQL Editor (once):

**Option A:** Run the full `back/supabase-schema.sql` again (it has a `do $$ ... end $$` block that adds missing columns).

**Option B:** Run only the migration file `back/supabase-migration-orders-express-status.sql` to add:
- `express_delivery` (boolean, default false) – משלוח אקספרס  
- `order_status` (text, default 'not_supplied') – סטטוס הזמנה (ערכין: `not_supplied` | `supplied`)
