// Auto migrations — تُشغَّل عند كل إقلاع *بعد* اكتمال إنشاء الجداول في config/database.js
// كل الأوامر idempotent (IF NOT EXISTS / شروط) — والفشل يُسجَّل بـ console.error بدل الابتلاع الصامت.
// ملاحظة: أعمدة المال الجديدة DOUBLE PRECISION (ترجع أرقاماً للعميل، لا نصوصاً مثل NUMERIC) والتقريب لخانتين بالكود.
const MIGRATIONS = [
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS store_type VARCHAR(20) DEFAULT 'restaurant'`,
  `ALTER TABLE banners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
  `ALTER TABLE banners ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
  `CREATE TABLE IF NOT EXISTS vip_customers (id SERIAL PRIMARY KEY, restaurant_id TEXT, customer_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vip_customers' AND column_name='restaurant_id' AND data_type <> 'text') THEN
       ALTER TABLE vip_customers ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text;
     END IF;
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vip_customers' AND column_name='customer_id' AND data_type <> 'text') THEN
       ALTER TABLE vip_customers ALTER COLUMN customer_id TYPE TEXT USING customer_id::text;
     END IF;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS vip_customers_uniq ON vip_customers(restaurant_id, customer_id)`,
  `CREATE TABLE IF NOT EXISTS support_chat (id SERIAL PRIMARY KEY, user_id TEXT, sender TEXT, message TEXT, is_read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS support_chat_user_idx ON support_chat(user_id)`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 15`,
  // 👥 الطلب الجماعي
  `CREATE TABLE IF NOT EXISTS group_orders (id SERIAL PRIMARY KEY, code TEXT UNIQUE, host_id TEXT, restaurant_id TEXT, restaurant_name TEXT, status TEXT DEFAULT 'open', order_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS group_order_items (id SERIAL PRIMARY KEY, group_id INTEGER, user_id TEXT, user_name TEXT, menu_item_id TEXT, name TEXT, price NUMERIC DEFAULT 0, image TEXT, quantity INTEGER DEFAULT 1, options TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS group_order_items_group_idx ON group_order_items(group_id)`,
  `CREATE TABLE IF NOT EXISTS group_order_members (group_id INTEGER NOT NULL, user_id TEXT NOT NULL, joined_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (group_id, user_id))`,

  // ⚡️ فهارس الأداء
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
  `CREATE INDEX IF NOT EXISTS idx_users_fcm ON users(fcm_token) WHERE fcm_token IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_rest_owner ON restaurants(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rest_category ON restaurants(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rest_active_open ON restaurants(is_active, is_open)`,
  `CREATE INDEX IF NOT EXISTS idx_menucat_rest ON menu_categories(restaurant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_menuitem_rest ON menu_items(restaurant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_menuitem_cat ON menu_items(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_itemopt_item ON item_options(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_itemoptval_opt ON item_option_values(option_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orderitems_order ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read)`,
  `CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online, is_busy)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_rest ON reviews(restaurant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_driver ON reviews(driver_id)`,
  `CREATE INDEX IF NOT EXISTS idx_addr_user ON addresses(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_couponusage_user ON coupon_usage(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number)`,

  // 🧍📦 التوصيل الشخصي
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_lat NUMERIC`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_lng NUMERIC`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_address TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_desc TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_size TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_photo TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS passengers INTEGER`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_km NUMERIC`,
  `CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service_type)`,

  // منع تكرار رقم الهاتف (يفشل ويُسجَّل لو فيه تكرارات قديمة)
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_phone ON users(phone) WHERE phone IS NOT NULL`,

  // تتبّع فوائد الطلب للاسترجاع عند الإلغاء
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_redeemed INTEGER DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_given NUMERIC DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS benefits_refunded BOOLEAN DEFAULT false`,

  // ⚙️ إعدادات عامة (KV)
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`,
  `INSERT INTO app_settings(key, value) VALUES ('personal_delivery', '{"enabled":true,"bike":{"base":3,"perKm":2},"car":{"base":5,"perKm":3},"parcelSize":{"small":0,"medium":3,"large":5},"minFare":3}') ON CONFLICT (key) DO NOTHING`,

  // ═══ جولة الإصلاح 2026-10-05 ═══
  // 💵 أعمدة مال/تتبّع جديدة على الطلبات
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip DOUBLE PRECISION DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_fee DOUBLE PRECISION`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount DOUBLE PRECISION DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_order_discount DOUBLE PRECISION DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_value DOUBLE PRECISION DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS free_delivery BOOLEAN DEFAULT false`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_pct DOUBLE PRECISION`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_processed BOOLEAN DEFAULT false`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_credited BOOLEAN DEFAULT false`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_expires_at TIMESTAMPTZ`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_delivery_time TEXT`,
  // رقم طلب فريد (يفشل ويُسجَّل فقط إذا كانت هناك تكرارات قديمة من المولّد القديم)
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_number ON orders(order_number) WHERE order_number IS NOT NULL AND order_number <> ''`,
  `CREATE INDEX IF NOT EXISTS idx_orders_dispatch ON orders(status) WHERE driver_assigned_at IS NULL`,

  // 👤 المستخدمون: الدعوة تُكافأ عند تسليم أول طلب
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_tier TEXT DEFAULT 'bronze'`,

  // 🛵 السائقون
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS wallet_balance REAL DEFAULT 0`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_busy BOOLEAN DEFAULT false`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lat REAL`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lng REAL`,

  // 🎟️ الكوبونات
  `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS usage_limit INTEGER`,
  `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0`,
  `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_discount REAL`,
  `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INTEGER DEFAULT 1`,
  `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
  `ALTER TABLE coupon_usage ADD COLUMN IF NOT EXISTS order_id INTEGER`,
  `ALTER TABLE coupon_usage ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
  `CREATE INDEX IF NOT EXISTS idx_couponusage_coupon_user ON coupon_usage(coupon_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_couponusage_order ON coupon_usage(order_id)`,

  // ❤️ المفضلة / 🏆 حركات الولاء / 🎫 تذاكر الدعم (كانت موجودة فقط في schema.sql غير المستخدم)
  `CREATE TABLE IF NOT EXISTS favorites (id SERIAL PRIMARY KEY, user_id INTEGER, restaurant_id INTEGER, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_rest_uniq ON favorites(user_id, restaurant_id)`,
  `CREATE TABLE IF NOT EXISTS loyalty_transactions (id SERIAL PRIMARY KEY, user_id INTEGER, points INTEGER NOT NULL DEFAULT 0, type TEXT, description TEXT, order_id INTEGER, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON loyalty_transactions(user_id, created_at DESC)`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS order_id INTEGER`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS message TEXT`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
  `CREATE TABLE IF NOT EXISTS support_messages (id SERIAL PRIMARY KEY, ticket_id INTEGER, sender_id INTEGER, message TEXT, is_admin BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id)`,

  // ═══ جولة الأداء 2026-10-05 (اختبار الحِمل) ═══
  // لوحة الإدارة: عدّ/جمع حسب الحالة ضمن نطاق تاريخ (اليوم بتوقيت فلسطين كنطاق نصف مفتوح)
  `CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC) INCLUDE (total)`,
  // لوحة المطعم (كل 20ث) + إحصاءات اليوم للمطعم
  `CREATE INDEX IF NOT EXISTS idx_orders_rest_created ON orders(restaurant_id, created_at DESC)`,
  // التوزيع: السائقون الذين لديهم عرض قائم (صغير جداً — فقط العروض غير المقبولة)
  `CREATE INDEX IF NOT EXISTS idx_orders_open_offers ON orders(driver_id) WHERE driver_assigned_at IS NULL AND driver_id IS NOT NULL AND status IN ('confirmed','preparing','ready')`,
  // /drivers/me: الطلب الحالي للسائق (نفس شرط الاستعلام حرفياً حتى يُستخدم الفهرس الجزئي)
  `CREATE INDEX IF NOT EXISTS idx_orders_driver_active ON orders(driver_id, created_at DESC) WHERE status NOT IN ('delivered','cancelled')`,
  // أرباح السائق (اليوم/الشهر) حسب وقت التسليم
  `CREATE INDEX IF NOT EXISTS idx_orders_driver_delivered ON orders(driver_id, delivered_at DESC) WHERE status = 'delivered'`,
  // مربّع البحث حول نقطة الاستلام للسائقين المتصلين
  `CREATE INDEX IF NOT EXISTS idx_drivers_online_loc ON drivers(current_lat, current_lng) WHERE is_online = true`,

  // ⚙️ مجموعات الإضافات "اختيار متعدد" كانت تُحفظ بـ max_selections=1 → التطبيق يعاملها كاختيار واحد
  `UPDATE item_options o SET max_selections = GREATEST(2, (SELECT COUNT(*) FROM item_option_values v WHERE v.option_id = o.id))
     WHERE o.type IN ('multiple','multi','checkbox') AND COALESCE(o.max_selections, 1) <= 1
       AND (SELECT COUNT(*) FROM item_option_values v WHERE v.option_id = o.id) > 1`,
];

async function runMigrations(pool) {
  let failed = 0;
  for (const sql of MIGRATIONS) {
    try { await pool.query(sql); }
    catch (e) {
      failed++;
      console.error(`⚠️ migration failed: ${e.message} :: ${sql.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }
  console.log(`✅ Migrations done (${MIGRATIONS.length - failed}/${MIGRATIONS.length} ok)`);
  return { total: MIGRATIONS.length, failed };
}

module.exports = { runMigrations, MIGRATIONS };
