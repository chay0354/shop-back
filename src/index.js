import 'dotenv/config';
import https from 'https';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sgMail from '@sendgrid/mail';
import { supabase } from './supabase.js';

const app = express();
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const INVOICE_FROM_EMAIL = process.env.INVOICE_FROM_EMAIL || '';

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);
const PORT = process.env.PORT || 4000;

const INVOICE_COPY_EMAILS = ['freexbutsa@gmail.com', 'freexazmanot@gmail.com', 'freexkabala@gmail.com'];

function log(level, tag, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${tag}]`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

async function sendOrderInvoiceEmail({ to, orderDisplayNumber, orderIdForLog, customerName, items, total, deliveryAddress, deliveryCity, deliveryTimeSlot, paymentMethod }) {
  // orderDisplayNumber = numeric מזהה הזמנה shown in email (e.g. 62020). Never use UUID here.
  const displayId = orderDisplayNumber != null ? String(orderDisplayNumber) : '';
  if (!SENDGRID_API_KEY || !INVOICE_FROM_EMAIL) {
    log('info', 'invoice-email', 'skipped – no SendGrid config', { orderDisplayNumber: displayId, orderIdForLog, hasKey: !!SENDGRID_API_KEY, hasFrom: !!INVOICE_FROM_EMAIL });
    return;
  }
  // Send to customer (when provided) and to the 3 copy addresses; dedupe by lowercase
  const userEmail = typeof to === 'string' ? to.trim() : '';
  const allEmails = [...(userEmail ? [userEmail] : []), ...INVOICE_COPY_EMAILS];
  const seen = new Set();
  const recipients = allEmails.filter((e) => {
    const key = e.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recipients.length === 0) {
    log('info', 'invoice-email', 'skipped – no recipients', { orderDisplayNumber: displayId });
    return;
  }
  log('info', 'invoice-email', 'sending', { orderDisplayNumber: displayId, orderIdForLog, recipients, recipientCount: recipients.length });
  const rows = (items || []).map((i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.unit_price) || 0;
    const lineTotal = (qty * price).toFixed(2);
    const name = (i.product_name_he || i.name_he || 'פריט').replace(/</g, '&lt;');
    return `<tr><td>${name}</td><td>${qty}</td><td>₪${price.toFixed(2)}</td><td>₪${lineTotal}</td></tr>`;
  }).join('');
  const paymentLabel = paymentMethod === 'card' ? 'כרטיס אשראי' : 'מזומן במשלוח';
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>חשבונית הזמנה ${displayId}</title></head>
<body style="font-family:Heebo,sans-serif;padding:1rem;max-width:500px;margin:0 auto;">
  <h1 style="font-size:1.25rem;">חשבונית / אישור הזמנה</h1>
  <p><strong>מזהה הזמנה:</strong> ${displayId}</p>
  <p><strong>שם:</strong> ${String(customerName || '').replace(/</g, '&lt;')}</p>
  <p><strong>כתובת:</strong> ${String(deliveryAddress || '').replace(/</g, '&lt;')}, ${String(deliveryCity || '').replace(/</g, '&lt;')}</p>
  ${deliveryTimeSlot ? `<p><strong>שעת משלוח:</strong> ${String(deliveryTimeSlot).replace(/</g, '&lt;')}</p>` : ''}
  <p><strong>אמצעי תשלום:</strong> ${paymentLabel}</p>
  <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
    <thead><tr style="border-bottom:2px solid #ddd;"><th style="text-align:right;">פריט</th><th>כמות</th><th>מחיר</th><th>סה"כ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:1.1rem;"><strong>סה"כ לתשלום: ₪${Number(total).toFixed(2)}</strong></p>
  <p style="color:#666;font-size:0.9rem;">תודה שקנית אצלנו.</p>
</body>
</html>`;
  try {
    await sgMail.send({
      to: recipients,
      from: INVOICE_FROM_EMAIL,
      subject: `אישור הזמנה #${displayId} – פריקס ישראל`,
      html,
    });
    log('info', 'invoice-email', 'sent OK', { orderDisplayNumber: displayId, orderIdForLog, recipients, recipientCount: recipients.length });
  } catch (err) {
    log('error', 'invoice-email', 'send failed', { orderDisplayNumber: displayId, orderIdForLog, error: err.message, recipients, recipientCount: recipients.length });
    throw err;
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path === '/api/health') return;
    log('info', 'request', req.method, req.path, res.statusCode, `${duration}ms`);
  });
  next();
});

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

    const { data: productsRaw } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true });
    const products = (productsRaw || []).filter((p) => !p.hidden);

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
    const list = (data || []).filter((p) => !p.hidden);
    res.json(list);
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

app.get('/api/carousel/bottom', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('home_carousel_bottom')
      .select('id, image_url, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const EXPRESS_DAILY_LIMIT_DEFAULT = 5;

function getTodayUtcRange() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getTodayDateKey() {
  const { start } = getTodayUtcRange();
  return start.slice(0, 10);
}

const DELIVERY_SLOT_KEYS = ['10-14', '14-18', '18-22'];

function defaultSlotLimits() {
  const o = {};
  for (const k of DELIVERY_SLOT_KEYS) o[k] = 1;
  return o;
}

function parseSlotLimits(raw) {
  const out = defaultSlotLimits();
  if (!raw) return out;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      for (const k of DELIVERY_SLOT_KEYS) {
        const v = parsed[k];
        const n = parseInt(v, 10);
        out[k] = Number.isFinite(n) && n >= 0 ? n : 1;
      }
    }
  } catch (_) {}
  return out;
}

async function getSettings() {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) return { express_daily_limit: EXPRESS_DAILY_LIMIT_DEFAULT, slot_limits: defaultSlotLimits() };
    const map = {};
    for (const row of data || []) map[row.key] = row.value;
    const todayKey = getTodayDateKey();
    const lastResetDate = (map.slot_limits_reset_date || '').trim();
    if (lastResetDate !== todayKey) {
      const defaults = defaultSlotLimits();
      const expressMax = Math.max(0, parseInt(map.express_daily_limit_max, 10) || parseInt(map.express_daily_limit, 10) || EXPRESS_DAILY_LIMIT_DEFAULT);
      await supabase.from('settings').upsert([
        { key: 'slot_limits', value: JSON.stringify(defaults) },
        { key: 'slot_limits_reset_date', value: todayKey },
        { key: 'express_daily_limit', value: String(expressMax) },
      ], { onConflict: 'key' });
      return {
        express_daily_limit: expressMax,
        slot_limits: defaults,
        delivery_blocked: (map.delivery_blocked || '').toLowerCase() === 'true',
      };
    }
    const remaining = parseInt(map.express_daily_limit, 10);
    const delivery_blocked = (map.delivery_blocked || '').toLowerCase() === 'true';
    return {
      express_daily_limit: Number.isFinite(remaining) && remaining >= 0 ? remaining : EXPRESS_DAILY_LIMIT_DEFAULT,
      slot_limits: parseSlotLimits(map.slot_limits),
      delivery_blocked,
    };
  } catch (_) {
    return { express_daily_limit: EXPRESS_DAILY_LIMIT_DEFAULT, slot_limits: defaultSlotLimits(), delivery_blocked: false };
  }
}

async function setExpressDailyLimit(limit) {
  const n = Math.max(0, parseInt(limit, 10) || 0);
  const value = String(n);
  await supabase.from('settings').upsert([
    { key: 'express_daily_limit', value },
    { key: 'express_daily_limit_max', value },
  ], { onConflict: 'key' });
}

async function decrementExpressRemaining() {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'express_daily_limit').single();
  if (error || !data) return;
  const current = Math.max(0, parseInt(data.value, 10) || 0);
  const next = Math.max(0, current - 1);
  await supabase.from('settings').upsert({ key: 'express_daily_limit', value: String(next) }, { onConflict: 'key' });
}

async function setSlotLimits(limits) {
  const normalized = parseSlotLimits(limits);
  const value = JSON.stringify(normalized);
  const todayKey = getTodayDateKey();
  await supabase.from('settings').upsert([
    { key: 'slot_limits', value },
    { key: 'slot_limits_reset_date', value: todayKey },
  ], { onConflict: 'key' });
}

async function setDeliveryBlocked(blocked) {
  const value = blocked ? 'true' : 'false';
  await supabase.from('settings').upsert({ key: 'delivery_blocked', value }, { onConflict: 'key' });
}

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

const CARDCOM_TERMINAL = process.env.CARDCOM_TERMINAL_NUMBER || '';
const CARDCOM_API_NAME = process.env.CARDCOM_API_NAME || '';
const CARDCOM_URL = (process.env.CARDCOM_URL || 'https://secure.cardcom.solutions').replace(/\/$/, '');

app.post('/api/checkout/init-payment', async (req, res) => {
  try {
    const { delivery_blocked } = await getSettings();
    if (delivery_blocked) return res.status(400).json({ error: DELIVERY_BLOCKED_MESSAGE });
    const amount = Number(req.body.amount);
    log('info', 'init-payment', 'request', {
      amount,
      productName: req.body.productName,
      itemsCount: req.body.items?.length,
      deliveryFee: req.body.deliveryFee,
      redirectBaseUrl: req.body.redirectBaseUrl || '(from origin)',
      origin: req.headers.origin,
    });
    if (!CARDCOM_TERMINAL || !CARDCOM_API_NAME) {
      log('warn', 'init-payment', 'missing env', { hasTerminal: !!CARDCOM_TERMINAL, hasApiName: !!CARDCOM_API_NAME });
      return res.status(503).json({ error: 'תשלום בכרטיס לא מוגדר. הגדר CARDCOM_TERMINAL_NUMBER ו־CARDCOM_API_NAME.' });
    }
    if (Number.isNaN(amount) || amount <= 0) {
      log('warn', 'init-payment', 'invalid amount', amount);
      return res.status(400).json({ error: 'סכום לא תקין' });
    }
    const productName = (req.body.productName || 'הזמנה').substring(0, 100);
    const baseUrl = req.body.redirectBaseUrl || req.headers.origin || req.get('referer')?.replace(/\/[^/]*$/, '') || 'https://secure.cardcom.solutions';
    const successRedirectUrl = req.body.successRedirectUrl || `${baseUrl}/checkout`;
    const failedRedirectUrl = req.body.failedRedirectUrl || `${baseUrl}/checkout`;
    const deliveryFee = Math.round((Number(req.body.deliveryFee) || 0) * 100) / 100;
    const round2 = (n) => Math.round(Number(n) * 100) / 100;
    const productLines = (req.body.items || []).map((item, idx) => {
      const qty = Number(item.quantity) || 1;
      const unit = round2(item.unit_price || 0);
      const lineTotal = round2(qty * unit);
      return {
        ProductID: String(idx + 1),
        Description: (item.product_name_he || item.name_he || 'פריט').substring(0, 200),
        Quantity: qty,
        UnitCost: unit,
        TotalLineCost: lineTotal,
      };
    });
    if (deliveryFee > 0) {
      productLines.push({
        ProductID: 'delivery',
        Description: 'דמי משלוח',
        Quantity: 1,
        UnitCost: deliveryFee,
        TotalLineCost: deliveryFee,
      });
    }
    const amountRounded = round2(amount);
    let documentTotal = productLines.reduce((sum, p) => sum + p.TotalLineCost, 0);
    const diff = round2(amountRounded - documentTotal);
    if (productLines.length > 0 && Math.abs(diff) > 0.001) {
      const last = productLines[productLines.length - 1];
      last.TotalLineCost = round2(last.TotalLineCost + diff);
      last.UnitCost = last.TotalLineCost;
    }
    const documentTotalFinal = productLines.reduce((sum, p) => sum + p.TotalLineCost, 0);
    log('info', 'init-payment', 'CardCom payload', {
      Amount: amountRounded,
      documentTotal: documentTotalFinal,
      productLinesCount: productLines.length,
      SuccessRedirectUrl: successRedirectUrl,
      FailedRedirectUrl: failedRedirectUrl,
    });
    const createPayload = {
      TerminalNumber: Number(CARDCOM_TERMINAL),
      ApiName: CARDCOM_API_NAME,
      Operation: 'ChargeOnly',
      Amount: amountRounded,
      ProductName: productName,
      Language: 'he',
      ISOCoinId: 1,
      SuccessRedirectUrl: successRedirectUrl,
      FailedRedirectUrl: failedRedirectUrl,
      Document: {
        Name: req.body.customer_name || 'לקוח',
        Products: productLines,
        IsAllowEditDocument: false,
        IsShowOnlyDocument: true,
        Language: 'he',
      },
    };
    const cardComUrl = `${CARDCOM_URL}/api/v11/LowProfile/create`;
    log('info', 'init-payment', 'calling CardCom', { url: cardComUrl });
    let cardRes;
    let cardJson = {};
    try {
      if (process.env.NODE_ENV !== 'production') {
        const u = new URL(cardComUrl);
        const body = JSON.stringify(createPayload);
        const devAgent = new https.Agent({ rejectUnauthorized: false });
        const [status, data] = await new Promise((resolve, reject) => {
          const req = https.request(
            {
              hostname: u.hostname,
              port: u.port || 443,
              path: u.pathname + u.search,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') },
              agent: devAgent,
            },
            (res) => {
              const chunks = [];
              res.on('data', (c) => chunks.push(c));
              res.on('end', () => resolve([res.statusCode, Buffer.concat(chunks).toString('utf8')]));
              res.on('error', reject);
            }
          );
          req.on('error', reject);
          req.setTimeout(15000, () => { req.destroy(); reject(new Error('CardCom request timeout')); });
          req.write(body);
          req.end();
        });
        cardRes = { status };
        try {
          cardJson = typeof data === 'string' ? JSON.parse(data) : data || {};
        } catch (_) {
          cardJson = {};
        }
      } else {
        cardRes = await fetch(cardComUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });
        cardJson = await cardRes.json().catch(() => ({}));
      }
    } catch (fetchErr) {
      log('error', 'init-payment', 'fetch to CardCom failed', fetchErr.message, { code: fetchErr.code, cause: fetchErr.cause?.message });
      return res.status(502).json({ error: 'לא ניתן להתחבר לקארדקום. בדוק חיבור רשת.', details: fetchErr.message });
    }
    const lowProfileId = cardJson.LowProfileId ?? cardJson.LowProfileID;
    log('info', 'init-payment', 'CardCom response', { status: cardRes.status, LowProfileId: lowProfileId, ResponseCode: cardJson.ResponseCode });
    if (!lowProfileId) {
      const errMsg = cardJson.Description || cardJson.Message || cardJson.Error || cardRes.statusText || 'CardCom error';
      log('error', 'init-payment', 'CardCom failed', cardRes.status, cardJson);
      return res.status(502).json({ error: 'לא ניתן ליצור עסקת תשלום. נסו שוב או בחרו מזומן.', details: errMsg });
    }
    log('info', 'init-payment', 'success', { LowProfileId: lowProfileId });
    res.json({ LowProfileId: lowProfileId, terminalNumber: Number(CARDCOM_TERMINAL) });
  } catch (e) {
    log('error', 'init-payment', 'exception', e.message, { code: e.code, cause: e.cause?.message });
    res.status(500).json({ error: e.message || 'שגיאה ביצירת תשלום' });
  }
});

const DELIVERY_BLOCKED_MESSAGE = 'משלוחים לא זמינים כעת, נסה שוב מאוחר יותר';

app.get('/api/checkout/orders-available', async (req, res) => {
  try {
    const { delivery_blocked } = await getSettings();
    res.json({ available: !delivery_blocked, message: delivery_blocked ? DELIVERY_BLOCKED_MESSAGE : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/checkout/delivery-slot-counts', async (req, res) => {
  try {
    log('info', 'checkout', 'delivery-slot-counts', { referer: req.get('referer')?.slice(0, 50) });
    const { slot_limits } = await getSettings();
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
    res.json({ counts, slot_limits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/checkout/express-available', async (req, res) => {
  try {
    log('info', 'checkout', 'express-available', { referer: req.get('referer')?.slice(0, 50) });
    const { express_daily_limit } = await getSettings();
    res.json({ available: express_daily_limit > 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: resolve order id (UUID) or number to display order number only
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.get('/api/orders/public/:id', async (req, res) => {
  try {
    const id = req.params.id?.trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    if (UUID_REGEX.test(id)) {
      const { data, error } = await supabase.from('orders').select('order_number').eq('id', id).maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Not found' });
      return res.json({ orderNumber: data.order_number });
    }
    const num = parseInt(id, 10);
    if (Number.isFinite(num)) return res.json({ orderNumber: num });
    return res.status(400).json({ error: 'Invalid id' });
  } catch (e) {
    log('error', 'orders-public', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { delivery_blocked } = await getSettings();
    if (delivery_blocked) return res.status(400).json({ error: DELIVERY_BLOCKED_MESSAGE });
    const { customer_name, customer_phone, customer_email, delivery_address, delivery_city, payment_method, customer_notes, express_delivery, delivery_time_slot, items } = req.body;
    log('info', 'orders', 'POST', { payment_method, itemsCount: items?.length });
    if (!customer_name || !customer_phone || !delivery_address || !delivery_city || !payment_method || !items?.length) {
      log('warn', 'orders', 'missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const express = Boolean(express_delivery);
    if (express) {
      const { express_daily_limit } = await getSettings();
      if (express_daily_limit <= 0) {
        return res.status(400).json({ error: 'משלוח אקספרס לא זמין כרגע. הגבול היומי של הזמנות אקספרס התמלא.' });
      }
    }
    if (delivery_time_slot) {
      const { slot_limits } = await getSettings();
      const slotKey = String(delivery_time_slot).trim();
      const rangeKey = slotKey.split(/\s+/).pop();
      const maxForSlot = (rangeKey && slot_limits[rangeKey] !== undefined) ? slot_limits[rangeKey] : 1;
      const { count: slotCount, error: slotErr } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('delivery_time_slot', slotKey);
      if (slotErr) throw slotErr;
      if ((slotCount ?? 0) >= maxForSlot) {
        return res.status(400).json({ error: 'חלון המשלוח שנבחר תפוס. בחרו חלון אחר.' });
      }
    }
    const subtotal = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0);
    const FREE_SHIPPING_MIN = 279;
    const DELIVERY_FEE = 15;
    const deliveryFee = subtotal > 0 && subtotal < FREE_SHIPPING_MIN ? DELIVERY_FEE : 0;
    const total = subtotal + deliveryFee;
    // Assign next order_number (62021, 62022, ...). Ignore nulls when taking max; retry on unique conflict.
    const getNextOrderNumber = async () => {
      const { data: maxRow } = await supabase.from('orders').select('order_number').not('order_number', 'is', null).order('order_number', { ascending: false }).limit(1).maybeSingle();
      return (maxRow?.order_number ?? 62020) + 1;
    };
    let order;
    let orderErr;
    let orderNumberFinal;
    for (let attempt = 0; attempt < 3; attempt++) {
      const nextOrderNumber = await getNextOrderNumber();
      const result = await supabase
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
          order_number: nextOrderNumber,
        })
        .select('id, order_number')
        .single();
      order = result.data;
      orderErr = result.error;
      if (!orderErr) {
        orderNumberFinal = order.order_number ?? nextOrderNumber;
        break;
      }
      const isUniqueViolation = orderErr.code === '23505' || String(orderErr.message || '').includes('unique');
      if (!isUniqueViolation) break;
      log('warn', 'orders', 'order_number conflict, retrying', { attempt: attempt + 1, nextOrderNumber });
    }
    if (orderErr) throw orderErr;
    const orderNumber = orderNumberFinal ?? order?.order_number;
    if (express) await decrementExpressRemaining();
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
    log('info', 'orders', 'created', { orderId: order.id, total, payment_method: payment_method });
    if (payment_method === 'card') {
      log('info', 'orders', 'PAYMENT SUCCESSFUL – order created after card payment', { orderId: order.id, total });
      const isTestOrder = Number(total) === 5 && items.length === 1 && items.every((i) => i.product_id == null);
      if (isTestOrder) log('info', 'orders', 'Test product order – PAYMENT SUCCESSFUL', { orderId: order.id });
    }
    const toEmail = typeof customer_email === 'string' ? customer_email.trim() : '';
    try {
      await sendOrderInvoiceEmail({
        to: toEmail || undefined,
        orderDisplayNumber: orderNumber,
        orderIdForLog: order.id,
        customerName: customer_name,
        items,
        total,
        deliveryAddress: delivery_address,
        deliveryCity: delivery_city,
        deliveryTimeSlot: delivery_time_slot || null,
        paymentMethod: payment_method,
      });
    } catch (emailErr) {
      log('error', 'invoice-email', emailErr.message, { orderNumber, orderId: order.id });
    }
    res.status(201).json({ orderId: order.id, orderNumber: orderNumber, total });
  } catch (e) {
    log('error', 'orders', e.message, e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: usage counts (not_supplied only — decreases when order marked supplied)
app.get('/api/admin/usage', async (_, res) => {
  try {
    const { data: slotRows, error: slotErr } = await supabase
      .from('orders')
      .select('delivery_time_slot')
      .not('delivery_time_slot', 'is', null)
      .neq('order_status', 'supplied');
    if (slotErr) throw slotErr;
    const slot_counts = {};
    for (const row of slotRows || []) {
      const key = String(row.delivery_time_slot).trim();
      if (key) slot_counts[key] = (slot_counts[key] || 0) + 1;
    }
    const { start, end } = getTodayUtcRange();
    const { count: express_count, error: expressErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('express_delivery', true)
      .neq('order_status', 'supplied')
      .gte('created_at', start)
      .lt('created_at', end);
    if (expressErr) throw expressErr;
    res.json({ slot_counts, express_count: express_count ?? 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get/update settings (e.g. express daily limit)
app.get('/api/admin/settings', async (_, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/settings', async (req, res) => {
  try {
    const { express_daily_limit, slot_limits, delivery_blocked } = req.body;
    if (express_daily_limit !== undefined) await setExpressDailyLimit(express_daily_limit);
    if (slot_limits !== undefined && typeof slot_limits === 'object') await setSlotLimits(slot_limits);
    if (delivery_blocked !== undefined) await setDeliveryBlocked(!!delivery_blocked);
    const settings = await getSettings();
    res.json(settings);
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

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error: itemsErr } = await supabase.from('order_items').delete().eq('order_id', id);
    if (itemsErr) throw itemsErr;
    const { error: orderErr } = await supabase.from('orders').delete().eq('id', id);
    if (orderErr) throw orderErr;
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
    const hidden = req.body.hidden === 'true' || req.body.hidden === true;

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
        hidden,
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
      .select('id, name_he, description_he, price, image_url, subcategory_id, sort_order, hidden')
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
    const hidden = req.body.hidden !== undefined ? (req.body.hidden === 'true' || req.body.hidden === true) : undefined;

    const updates = {};
    if (name_he !== undefined && name_he !== '') updates.name_he = name_he;
    if (description_he !== undefined) updates.description_he = description_he;
    if (price !== undefined && !Number.isNaN(price) && price >= 0) updates.price = price.toFixed(2);
    if (subcategory_id !== undefined) updates.subcategory_id = subcategory_id;
    if (hidden !== undefined) updates.hidden = hidden;

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

app.get('/api/admin/carousel/bottom', async (_, res) => {
  try {
    const { data, error } = await supabase
      .from('home_carousel_bottom')
      .select('id, image_url, sort_order, created_at')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/carousel/bottom', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'נא להעלות קובץ תמונה' });
    }
    await ensureProductImagesBucket();
    const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
    const path = `carousel-bottom/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    const { error: uploadErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    const image_url = urlData?.publicUrl || null;
    const { data: existing } = await supabase.from('home_carousel_bottom').select('sort_order').order('sort_order', { ascending: false }).limit(1).single();
    const sort_order = (existing?.sort_order ?? -1) + 1;
    const { data: row, error } = await supabase
      .from('home_carousel_bottom')
      .insert({ image_url, sort_order })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה בהוספת תמונה לקרוסלה התחתונה' });
  }
});

app.delete('/api/admin/carousel/bottom/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('home_carousel_bottom').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'שגיאה במחיקת תמונה מהקרוסלה התחתונה' });
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
    log('info', 'server', `Listening at http://localhost:${PORT}`);
    log('info', 'server', 'CardCom', { configured: !!(CARDCOM_TERMINAL && CARDCOM_API_NAME), note: 'Use production terminal + API name from CardCom back office for live charges' });
    log('info', 'server', 'SendGrid invoice email', { configured: !!(SENDGRID_API_KEY && INVOICE_FROM_EMAIL) });
  });
}

export default app;
