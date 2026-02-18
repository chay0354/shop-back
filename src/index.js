import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { supabase } from './supabase.js';

const app = express();
const PORT = process.env.PORT || 4000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use((req, res, next) => {
  const o = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', o || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

app.get('/', (_, res) => res.json({ ok: true, message: 'Shop API', docs: '/api/health' }));
app.get('/api', (_, res) => res.json({ ok: true, message: 'Shop API', health: '/api/health' }));

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/categories', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/subcategories', async (req, res) => {
  try {
    let q = supabase.from('subcategories').select('*').order('sort_order', { ascending: true });
    const categoryId = req.query.category_id;
    if (categoryId) q = q.eq('category_id', categoryId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/store', async (_, res) => {
  try {
    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (catErr) throw catErr;

    const { data: subcategories, error: subErr } = await supabase
      .from('subcategories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (subErr) throw subErr;

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true });

    const byCategory = (subcategories || []).reduce((acc, sub) => {
      if (!acc[sub.category_id]) acc[sub.category_id] = [];
      acc[sub.category_id].push(sub);
      return acc;
    }, {});

    const bySub = (products || []).reduce((acc, p) => {
      if (!acc[p.subcategory_id]) acc[p.subcategory_id] = [];
      acc[p.subcategory_id].push(p);
      return acc;
    }, {});

    const store = (categories || []).map((cat) => ({
      ...cat,
      subcategories: (byCategory[cat.id] || []).map((sub) => ({
        ...sub,
        products: bySub[sub.id] || [],
      })),
    }));

    res.json(store);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    let q = supabase.from('products').select('*').order('sort_order', { ascending: true });
    const subcategoryId = req.query.subcategory_id;
    if (subcategoryId) q = q.eq('subcategory_id', subcategoryId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/carousel', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('home_carousel')
      .select('id, image_url, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const EXPRESS_NOT_DELIVERED_LIMIT = 5;

async function uploadAdminImage(file, folder) {
  await ensureProductImagesBucket();
  const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

const MAX_ORDERS_PER_DELIVERY_SLOT = 5;

app.get('/api/checkout/delivery-slot-counts', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('delivery_time_slot')
      .not('delivery_time_slot', 'is', null);
    if (error) throw error;
    const counts = {};
    for (const row of data || []) {
      const key = String(row.delivery_time_slot).trim();
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    res.json(counts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/checkout/express-available', async (_, res) => {
  try {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('express_delivery', true)
      .eq('order_status', 'not_supplied');
    if (error) throw error;
    const available = (count ?? 0) < EXPRESS_NOT_DELIVERED_LIMIT;
    res.json({ available });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, delivery_address, delivery_city, payment_method, customer_notes, express_delivery, delivery_time_slot, items } = req.body;
    if (!customer_name || !customer_phone || !delivery_address || !delivery_city || !payment_method || !items?.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const express = Boolean(express_delivery);
    if (express) {
      const { count, error: countErr } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('express_delivery', true)
        .eq('order_status', 'not_supplied');
      if (countErr) throw countErr;
      if ((count ?? 0) >= EXPRESS_NOT_DELIVERED_LIMIT) {
        return res.status(400).json({ error: 'משלוח אקספרס לא זמין כרגע. הגבול של 5 הזמנות אקספרס שלא סופקו התמלא.' });
      }
    }
    if (delivery_time_slot) {
      const slotKey = String(delivery_time_slot).trim();
      const { count: slotCount, error: slotErr } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('delivery_time_slot', slotKey);
      if (slotErr) throw slotErr;
      if ((slotCount ?? 0) >= MAX_ORDERS_PER_DELIVERY_SLOT) {
        return res.status(400).json({ error: 'שעת המשלוח שנבחרה מלאה (5 הזמנות). בחרו שעה אחרת.' });
      }
    }
    const total = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0);
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_name,
        customer_phone,
        delivery_address,
        delivery_city,
        payment_method,
        customer_notes: customer_notes || null,
        express_delivery: express,
        order_status: 'not_supplied',
        delivery_time_slot: delivery_time_slot || null,
        total: total.toFixed(2),
        status: 'new',
      })
      .select('id')
      .single();
    if (orderErr) throw orderErr;
    const orderItems = items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id || null,
      product_name_he: i.product_name_he,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: (Number(i.quantity) * Number(i.unit_price)).toFixed(2),
    }));
    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems);
    if (itemsErr) throw itemsErr;
    res.status(201).json({ orderId: order.id, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list all orders with full details and items
app.get('/api/admin/orders', async (_, res) => {
  try {
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (ordersErr) throw ordersErr;

    const { data: allItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .order('created_at', { ascending: true });
    if (itemsErr) throw itemsErr;

    const itemsByOrder = (allItems || []).reduce((acc, item) => {
      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push(item);
      return acc;
    }, {});

    const ordersWithItems = (orders || []).map((o) => ({
      ...o,
      items: itemsByOrder[o.id] || [],
    }));

    res.json(ordersWithItems);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status } = req.body;
    if (!['supplied', 'not_supplied'].includes(order_status)) {
      return res.status(400).json({ error: 'Invalid order_status' });
    }
    const { error } = await supabase
      .from('orders')
      .update({ order_status })
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PRODUCT_IMAGES_BUCKET = 'product-images';

async function ensureProductImagesBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets && buckets.some((b) => b.name === PRODUCT_IMAGES_BUCKET)) return;
  const { error } = await supabase.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  });
  if (error && !error.message?.includes('already exists')) console.warn('Storage bucket:', error?.message);
}

app.post('/api/admin/products', upload.single('image'), async (req, res) => {
  try {
    const subcategory_id = req.body.subcategory_id;
    const name_he = (req.body.name_he || '').trim();
    const description_he = (req.body.description_he || '').trim() || null;
    const price = Number(req.body.price);
    const sort_order = Number(req.body.sort_order) || 0;

    if (!subcategory_id || !name_he || Number.isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'חסרים שדות חובה: תת־קטגוריה, שם מוצר, מחיר' });
    }

    let image_url = null;
    const file = req.file;
    if (file && file.buffer) {
      await ensureProductImagesBucket();
      const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
      const { error: uploadErr } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
      image_url = urlData?.publicUrl || null;
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        subcategory_id,
        name_he,
        description_he,
        price: price.toFixed(2),
        image_url,
        sort_order,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(product);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בשמירת מוצר' });
  }
});

app.get('/api/admin/products', async (_, res) => {
  try {
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name_he, description_he, price, image_url, subcategory_id, sort_order')
      .order('sort_order', { ascending: true });
    if (prodErr) throw prodErr;
    const { data: subcategories, error: subErr } = await supabase
      .from('subcategories')
      .select('id, name_he, category_id');
    if (subErr) throw subErr;
    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .select('id, name_he');
    if (catErr) throw catErr;
    const subMap = (subcategories || []).reduce((acc, s) => { acc[s.id] = s; return acc; }, {});
    const catMap = (categories || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
    const list = (products || []).map((p) => {
      const sub = subMap[p.subcategory_id];
      const cat = sub ? catMap[sub.category_id] : null;
      return {
        ...p,
        subcategory_name: sub?.name_he,
        category_name: cat?.name_he,
        category_id: sub?.category_id,
      };
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const name_he = (req.body.name_he || '').trim();
    const description_he = req.body.description_he !== undefined ? (req.body.description_he || '').trim() || null : undefined;
    const price = req.body.price !== undefined ? Number(req.body.price) : undefined;
    const subcategory_id = req.body.subcategory_id || undefined;

    const updates = {};
    if (name_he !== undefined && name_he !== '') updates.name_he = name_he;
    if (description_he !== undefined) updates.description_he = description_he;
    if (price !== undefined && !Number.isNaN(price) && price >= 0) updates.price = price.toFixed(2);
    if (subcategory_id !== undefined) updates.subcategory_id = subcategory_id;

    const file = req.file;
    if (file && file.buffer) {
      await ensureProductImagesBucket();
      const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
      const { error: uploadErr } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
      updates.image_url = urlData?.publicUrl || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }

    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בעדכון מוצר' });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה במחיקת מוצר' });
  }
});

app.get('/api/admin/carousel', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('home_carousel')
      .select('id, image_url, sort_order, created_at')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/carousel', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'נא להעלות קובץ תמונה' });
    }
    await ensureProductImagesBucket();
    const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
    const path = `carousel/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    const { error: uploadErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    const image_url = urlData?.publicUrl || null;
    const { data: existing } = await supabase.from('home_carousel').select('sort_order').order('sort_order', { ascending: false }).limit(1).single();
    const sort_order = (existing?.sort_order ?? -1) + 1;
    const { data: row, error } = await supabase
      .from('home_carousel')
      .insert({ image_url, sort_order })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בהוספת תמונה לקרוסלה' });
  }
});

app.delete('/api/admin/carousel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('home_carousel').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה במחיקת תמונה מהקרוסלה' });
  }
});

app.get('/api/admin/categories', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/categories', upload.single('image'), async (req, res) => {
  try {
    const name_he = (req.body.name_he || '').trim();
    const slug = (req.body.slug || '').trim() || `cat-${Date.now()}`;
    const sort_order = Number(req.body.sort_order);
    const icon = (req.body.icon || '').trim() || null;
    if (!name_he) return res.status(400).json({ error: 'חסר שם קטגוריה' });
    let image_url = null;
    if (req.file?.buffer) image_url = await uploadAdminImage(req.file, 'categories');
    const { data, error } = await supabase
      .from('categories')
      .insert({ name_he, slug, sort_order: Number.isNaN(sort_order) ? 0 : sort_order, icon, image_url })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בהוספת קטגוריה' });
  }
});

app.patch('/api/admin/categories/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const name_he = (req.body.name_he || '').trim();
    if (name_he) updates.name_he = name_he;
    if (req.body.slug !== undefined) updates.slug = (req.body.slug || '').trim() || null;
    if (req.body.sort_order !== undefined) updates.sort_order = Number(req.body.sort_order) || 0;
    if (req.body.icon !== undefined) updates.icon = (req.body.icon || '').trim() || null;
    if (req.file?.buffer) updates.image_url = await uploadAdminImage(req.file, 'categories');
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'אין שדות לעדכון' });
    const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בעדכון קטגוריה' });
  }
});

app.delete('/api/admin/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: subs } = await supabase.from('subcategories').select('id').eq('category_id', id).limit(1);
    if (subs?.length) return res.status(400).json({ error: 'לא ניתן למחוק קטגוריה שיש בה תת־קטגוריות. מחק קודם את התת־קטגוריות.' });
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה במחיקת קטגוריה' });
  }
});

app.get('/api/admin/subcategories', async (req, res) => {
  try {
    let q = supabase.from('subcategories').select('*').order('sort_order', { ascending: true });
    if (req.query.category_id) q = q.eq('category_id', req.query.category_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/subcategories', upload.single('image'), async (req, res) => {
  try {
    const category_id = req.body.category_id;
    const name_he = (req.body.name_he || '').trim();
    const slug = (req.body.slug || '').trim() || `sub-${Date.now()}`;
    const sort_order = Number(req.body.sort_order);
    if (!category_id || !name_he) return res.status(400).json({ error: 'חסרים קטגוריה או שם תת־קטגוריה' });
    let image_url = null;
    if (req.file?.buffer) image_url = await uploadAdminImage(req.file, 'subcategories');
    const { data, error } = await supabase
      .from('subcategories')
      .insert({ category_id, name_he, slug, sort_order: Number.isNaN(sort_order) ? 0 : sort_order, image_url })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בהוספת תת־קטגוריה' });
  }
});

app.patch('/api/admin/subcategories/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    if ((req.body.name_he || '').trim()) updates.name_he = req.body.name_he.trim();
    if (req.body.category_id !== undefined) updates.category_id = req.body.category_id;
    if (req.body.slug !== undefined) updates.slug = (req.body.slug || '').trim() || null;
    if (req.body.sort_order !== undefined) updates.sort_order = Number(req.body.sort_order) || 0;
    if (req.file?.buffer) updates.image_url = await uploadAdminImage(req.file, 'subcategories');
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'אין שדות לעדכון' });
    const { data, error } = await supabase.from('subcategories').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בעדכון תת־קטגוריה' });
  }
});

app.delete('/api/admin/subcategories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: prods } = await supabase.from('products').select('id').eq('subcategory_id', id).limit(1);
    if (prods?.length) return res.status(400).json({ error: 'לא ניתן למחוק תת־קטגוריה שיש בה מוצרים. העבר או מחק קודם את המוצרים.' });
    const { error } = await supabase.from('subcategories').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה במחיקת תת־קטגוריה' });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    await ensureProductImagesBucket();
    console.log(`Backend running at http://localhost:${PORT}`);
  });
}

export default app;
