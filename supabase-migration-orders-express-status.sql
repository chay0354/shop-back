-- Run this in Supabase SQL Editor (after the main schema).
-- Adds: משלוח אקספרס (express_delivery) and סטטוס הזמנה (order_status).

-- 1) משלוח אקספרס – האם ההזמנה עם משלוח אקספרס
alter table orders add column if not exists express_delivery boolean not null default false;

-- 2) סטטוס הזמנה – רק באדמין: הזמנה סופקה / הזמנה לא סופקה
alter table orders add column if not exists order_status text not null default 'not_supplied';

-- ערכים תקניים: 'not_supplied' = הזמנה לא סופקה, 'supplied' = הזמנה סופקה
-- (אם הטבלה כבר קיימת ואין את העמודה, ה־add column if not exists יטפל)

comment on column orders.express_delivery is 'משלוח אקספרס';
comment on column orders.order_status is 'סטטוס הזמנה: not_supplied | supplied';

-- 3) שעת משלוח (תיאום בשעות עגולות)
alter table orders add column if not exists delivery_time_slot text;
comment on column orders.delivery_time_slot is 'שעת משלוח בתיאום, למשל 15:00-16:00';
