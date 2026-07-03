const path = require('path');

if (!process.env.DATABASE_URL) {
  const Database = require('better-sqlite3');
  const bcrypt = require('bcryptjs');
  const db = new Database(path.join(__dirname, '..', 'wasaly.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, email TEXT UNIQUE, phone TEXT UNIQUE,
      password_hash TEXT, role TEXT DEFAULT 'customer',
      avatar TEXT, city TEXT, is_verified INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1, is_blocked INTEGER DEFAULT 0,
      wallet_balance REAL DEFAULT 0, loyalty_points INTEGER DEFAULT 0,
      loyalty_tier TEXT DEFAULT 'bronze', referral_code TEXT,
      fcm_token TEXT, vehicle_type TEXT, vehicle_number TEXT,
      rating REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT, code TEXT, used INTEGER DEFAULT 0,
      expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT, name_en TEXT, icon TEXT, image TEXT,
      sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT, name_en TEXT, description_ar TEXT, description_en TEXT,
      logo TEXT, cover_image TEXT, phone TEXT, email TEXT,
      category_id INTEGER, rating REAL DEFAULT 0, total_reviews INTEGER DEFAULT 0,
      is_open INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, is_featured INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 1,
      address TEXT, city TEXT, lat REAL, lng REAL,
      delivery_time_min INTEGER DEFAULT 25, delivery_time_max INTEGER DEFAULT 45,
      delivery_fee REAL DEFAULT 2, min_order REAL DEFAULT 10,
      commission_rate REAL DEFAULT 15,
      owner_id INTEGER, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER, name_ar TEXT, name_en TEXT,
      sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER,
      subscription TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER, category_id INTEGER,
      name_ar TEXT, name_en TEXT, description_ar TEXT,
      price REAL, discount_price REAL,
      image TEXT, is_available INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS item_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER, name_ar TEXT, name_en TEXT,
      type TEXT DEFAULT 'radio', is_required INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS item_option_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER, name_ar TEXT, name_en TEXT,
      extra_price REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT,
      customer_id INTEGER, restaurant_id INTEGER, driver_id INTEGER,
      status TEXT DEFAULT 'pending',
      subtotal REAL DEFAULT 0,
      total REAL, delivery_fee REAL DEFAULT 0,
      discount REAL DEFAULT 0, loyalty_discount REAL DEFAULT 0,
      tax REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      commission_rate REAL DEFAULT 15,
      address_id INTEGER, delivery_address TEXT,
      delivery_lat REAL, delivery_lng REAL,
      notes TEXT, payment_method TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'pending',
      coupon_code TEXT, cancel_reason TEXT,
      order_type TEXT DEFAULT 'delivery',
      loyalty_points_earned INTEGER DEFAULT 0,
      loyalty_points_used INTEGER DEFAULT 0,
      estimated_delivery_time TEXT,
      restaurant_accepted_at TEXT,
      driver_assigned_at TEXT,
      picked_up_at TEXT,
      delivered_at TEXT,
      cancelled_at TEXT,
      actual_delivery_time TEXT,
      rating_restaurant INTEGER,
      rating_driver INTEGER,
      review_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER, item_id INTEGER, menu_item_id INTEGER,
      name_ar TEXT, name_en TEXT, quantity INTEGER, price REAL,
      subtotal REAL DEFAULT 0, options TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, title TEXT, title_ar TEXT, title_en TEXT,
      body TEXT, body_ar TEXT, body_en TEXT,
      type TEXT, data TEXT, is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE, type TEXT DEFAULT 'fixed', value REAL,
      min_order REAL DEFAULT 0, max_discount REAL,
      max_uses INTEGER DEFAULT 100, uses_count INTEGER DEFAULT 0,
      usage_limit INTEGER DEFAULT 100, usage_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1, expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS coupon_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER, user_id INTEGER, order_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, label TEXT, title TEXT, address TEXT,
      floor TEXT, notes TEXT,
      lat REAL, lng REAL, is_default INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, menu_item_id INTEGER, quantity INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER UNIQUE, customer_id INTEGER, restaurant_id INTEGER,
      driver_id INTEGER, restaurant_rating INTEGER, driver_rating INTEGER,
      comment TEXT, images TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, title_ar TEXT, title_en TEXT,
      image TEXT, link_type TEXT, link_value TEXT,
      sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
      starts_at TEXT, ends_at TEXT
    );
    CREATE TABLE IF NOT EXISTS restaurant_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER, day_of_week INTEGER,
      open_time TEXT, close_time TEXT, is_closed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      is_online INTEGER DEFAULT 0,
      is_busy INTEGER DEFAULT 0,
      lat REAL, lng REAL,
      current_lat REAL, current_lng REAL,
      vehicle_type TEXT, vehicle_number TEXT, vehicle_plate TEXT,
      national_id TEXT, license_number TEXT,
      rating REAL DEFAULT 0,
      total_deliveries INTEGER DEFAULT 0,
      wallet_balance REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, type TEXT, amount REAL,
      description TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, subject TEXT, message TEXT,
      status TEXT DEFAULT 'open', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      min_km REAL DEFAULT 0,
      max_km REAL DEFAULT 3,
      price REAL DEFAULT 5,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add missing columns to existing tables (safe, idempotent)
  const addColIfMissing = (table, col, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch(e) {}
  };
  addColIfMissing('drivers', 'is_busy', 'INTEGER DEFAULT 0');
  addColIfMissing('drivers', 'current_lat', 'REAL');
  addColIfMissing('drivers', 'current_lng', 'REAL');
  addColIfMissing('drivers', 'vehicle_plate', 'TEXT');
  addColIfMissing('drivers', 'national_id', 'TEXT');
  addColIfMissing('drivers', 'license_number', 'TEXT');
  addColIfMissing('drivers', 'wallet_balance', 'REAL DEFAULT 0');
  addColIfMissing('orders', 'subtotal', 'REAL DEFAULT 0');
  addColIfMissing('orders', 'discount', 'REAL DEFAULT 0');
  addColIfMissing('orders', 'loyalty_discount', 'REAL DEFAULT 0');
  addColIfMissing('orders', 'tax', 'REAL DEFAULT 0');
  addColIfMissing('orders', 'payment_status', 'TEXT DEFAULT "pending"');
  addColIfMissing('orders', 'cancel_reason', 'TEXT');
  addColIfMissing('orders', 'order_type', 'TEXT DEFAULT "delivery"');
  addColIfMissing('orders', 'loyalty_points_earned', 'INTEGER DEFAULT 0');
  addColIfMissing('orders', 'loyalty_points_used', 'INTEGER DEFAULT 0');
  addColIfMissing('orders', 'restaurant_accepted_at', 'TEXT');
  addColIfMissing('orders', 'driver_assigned_at', 'TEXT');
  addColIfMissing('orders', 'picked_up_at', 'TEXT');
  addColIfMissing('orders', 'delivered_at', 'TEXT');
  addColIfMissing('orders', 'cancelled_at', 'TEXT');
  addColIfMissing('orders', 'actual_delivery_time', 'TEXT');
  addColIfMissing('orders', 'rating_restaurant', 'INTEGER');
  addColIfMissing('orders', 'rating_driver', 'INTEGER');
  addColIfMissing('orders', 'review_text', 'TEXT');
  addColIfMissing('order_items', 'item_id', 'INTEGER');
  addColIfMissing('order_items', 'name_en', 'TEXT');
  addColIfMissing('order_items', 'subtotal', 'REAL DEFAULT 0');
  addColIfMissing('order_items', 'options', 'TEXT');
  addColIfMissing('order_items', 'notes', 'TEXT');
  addColIfMissing('restaurants', 'phone', 'TEXT');
  addColIfMissing('restaurants', 'email', 'TEXT');
  addColIfMissing('restaurants', 'updated_at', 'TEXT');
  addColIfMissing('restaurants', 'opens_at', 'TEXT');
  addColIfMissing('restaurants', 'closes_at', 'TEXT');
  addColIfMissing('restaurants', 'preparation_time_min', 'INTEGER DEFAULT 20');
  addColIfMissing('restaurants', 'preparation_time_max', 'INTEGER DEFAULT 35');
  addColIfMissing('restaurants', 'tags', 'TEXT');
  addColIfMissing('menu_items', 'description_en', 'TEXT');
  addColIfMissing('menu_items', 'calories', 'INTEGER');
  addColIfMissing('menu_items', 'is_featured', 'INTEGER DEFAULT 0');
  addColIfMissing('menu_items', 'is_new', 'INTEGER DEFAULT 0');
  addColIfMissing('menu_items', 'is_spicy', 'INTEGER DEFAULT 0');
  addColIfMissing('menu_items', 'is_vegetarian', 'INTEGER DEFAULT 0');
  addColIfMissing('menu_items', 'is_vegan', 'INTEGER DEFAULT 0');
  addColIfMissing('menu_items', 'preparation_time', 'INTEGER DEFAULT 15');
  addColIfMissing('menu_items', 'created_at', 'TEXT');
  addColIfMissing('coupons', 'usage_limit', 'INTEGER DEFAULT 100');
  addColIfMissing('coupons', 'usage_count', 'INTEGER DEFAULT 0');
  addColIfMissing('coupons', 'max_discount', 'REAL');
  addColIfMissing('addresses', 'floor', 'TEXT');
  addColIfMissing('addresses', 'notes', 'TEXT');
  addColIfMissing('notifications', 'title_ar', 'TEXT');
  addColIfMissing('notifications', 'title_en', 'TEXT');
  addColIfMissing('notifications', 'body_ar', 'TEXT');
  addColIfMissing('notifications', 'body_en', 'TEXT');

  // Seed delivery zones if not exist
  const zonesExist = db.prepare("SELECT COUNT(*) as c FROM delivery_zones").get();
  if (!zonesExist || zonesExist.c === 0) {
    db.prepare("INSERT INTO delivery_zones (name, min_km, max_km, price) VALUES (?,?,?,?)").run('قريب (1-3 كم)', 0, 3, 5);
    db.prepare("INSERT INTO delivery_zones (name, min_km, max_km, price) VALUES (?,?,?,?)").run('متوسط (3-5 كم)', 3, 5, 8);
    db.prepare("INSERT INTO delivery_zones (name, min_km, max_km, price) VALUES (?,?,?,?)").run('بعيد (5+ كم)', 5, 999, 12);
    console.log('✅ Delivery zones created');
  }

  // Always ensure admin exists (runs every startup)
  const _adminExists = db.prepare("SELECT id FROM users WHERE phone='05999039704'").get();
  if (!_adminExists) {
    db.prepare(`INSERT INTO users (name,phone,password_hash,role,referral_code,is_active,is_verified) VALUES (?,?,?,?,?,1,1)`)
      .run('Admin', '05999039704', bcrypt.hashSync('123456', 10), 'admin', 'ADM001');
    console.log('✅ Admin created: 05999039704 / 123456');
  }

  // Seed categories if not exist
  if (!db.prepare("SELECT id FROM categories LIMIT 1").get()) {
    const cats = [
      ['برغر', 'Burger', '🍔'], ['بيتزا', 'Pizza', '🍕'], ['شاورما', 'Shawarma', '🌯'],
      ['دجاج', 'Chicken', '🍗'], ['مشاوي', 'Grills', '🥩'], ['حلويات', 'Sweets', '🍰'],
      ['مشروبات', 'Drinks', '🥤'], ['سلطات', 'Salads', '🥗'], ['ماركت', 'Market', '🛒'], ['صيدلية', 'Pharmacy', '💊'],
    ];
    cats.forEach(([name_ar, name_en, icon], i) => {
      db.prepare(`INSERT OR IGNORE INTO categories (name_ar,name_en,icon,sort_order) VALUES (?,?,?,?)`).run(name_ar, name_en, icon, i);
    });
    console.log('✅ Categories seeded');
  }

  if (!db.prepare("SELECT id FROM banners LIMIT 1").get()) {
    db.prepare(`INSERT INTO banners (title_ar,title_en,image,link_type,link_value,sort_order,is_active) VALUES (?,?,?,?,?,?,?)`)
      .run('عروض خاصة', 'Special Offers', 'https://via.placeholder.com/400x160/FF6B00/FFF?text=وصلّي', 'none', '', 0, 1);
  }

  const pool = {
    query: (text, params = []) => {
      try {
        let sql = text
          .replace(/\:\:\w+/gi, '')
          .replace(/,?\s*CASE\s+WHEN\s+\$\d+\s+IS\s+NOT\s+NULL[\s\S]*?END\s+as\s+distance_km/gi, ', NULL as distance_km')
          .replace(/round\(\(point\([^)]+\)\s*<@>\s*point\([^)]+\)\)[^)]*\)/gi, '0')
          .replace(/json_agg\([^)]+\)/gi, 'NULL')
          .replace(/json_build_object\([^)]+\)/gi, 'NULL')
          .replace(/array_agg\([^)]+\)/gi, 'NULL')
          .replace(/string_agg\([^,]+,[^)]+\)/gi, 'NULL')
          .replace(/\bas\s+values\b/gi, 'as option_values')
          .replace(/NOW\(\)/gi, "datetime('now')")
          .replace(/created_at\s*>\s*datetime\('now'\)\s*-\s*INTERVAL\s+'(\d+)\s+days?'/gi,
            (_, n) => `created_at > datetime('now', '-${n} days')`)
          .replace(/delivered_at\s*>\s*datetime\('now'\)\s*-\s*INTERVAL\s+'(\d+)\s+days?'/gi,
            (_, n) => `delivered_at > datetime('now', '-${n} days')`)
          .replace(/INTERVAL\s+'(\d+)\s+days?'/gi, (_, n) => `'-${n} days'`)
          .replace(/ILIKE/gi, 'LIKE')
          .replace(/\btrue\b/g, '1')
          .replace(/\bfalse\b/g, '0')
          .replace(/RETURNING\s*\*/gi, '')
          .replace(/RETURNING\s+[\w,\s]+/gi, '')
          .replace(/NULLS\s+LAST/gi, '')
          .replace(/NULLS\s+FIRST/gi, '')
          .replace(/DATE\(created_at\)/gi, "strftime('%Y-%m-%d', created_at)")
          .replace(/DATE\(delivered_at\)/gi, "strftime('%Y-%m-%d', delivered_at)")
          .replace(/DATE\(updated_at\)/gi, "strftime('%Y-%m-%d', updated_at)")
          .replace(/\bcount\(\*\)\b/gi, 'count(*)')
          .replace(/ON CONFLICT\s+\([^)]+\)\s+DO NOTHING/gi, 'OR IGNORE')
          .replace(/ON CONFLICT\s+\([^)]+\)\s+DO UPDATE SET/gi, '')
          .replace(/COALESCE/gi, 'COALESCE');

        const expandedParams = [];
        sql = sql.replace(/\$(\d+)/g, (_, n) => {
          expandedParams.push(params[parseInt(n) - 1]);
          return '?';
        });

        const isSelect = /^\s*(SELECT|WITH)/i.test(text);
        const isInsert = /^\s*INSERT/i.test(text);

        if (isSelect) {
          const rows = db.prepare(sql).all(...expandedParams);
          const normalized = rows.map(r => {
            if ('count(*)' in r) r.count = r['count(*)'];
            return r;
          });
          return Promise.resolve({ rows: normalized, rowCount: normalized.length });
        } else if (isInsert && /RETURNING/i.test(text)) {
          const result = db.prepare(sql).run(...expandedParams);
          const tableName = text.match(/INTO\s+(\w+)/i)?.[1];
          const row = tableName
            ? db.prepare(`SELECT * FROM ${tableName} WHERE rowid=?`).get(result.lastInsertRowid)
            : { id: result.lastInsertRowid };
          return Promise.resolve({ rows: [row || { id: result.lastInsertRowid }], rowCount: 1 });
        } else {
          const result = db.prepare(sql).run(...expandedParams);
          return Promise.resolve({ rows: [], rowCount: result.changes });
        }
      } catch (e) {
        console.error('DB Error:', e.message, '\nSQL:', text.substring(0, 300));
        return Promise.reject(e);
      }
    },
    // Fake connect for transaction support - just uses regular queries
    connect: () => {
      const client = {
        query: pool.query,
        release: () => {},
      };
      return Promise.resolve(client);
    }
  };

  module.exports = pool;
} else {
  const { Pool } = require('pg');
  const bcrypt = require('bcryptjs');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  pool.on('connect', () => console.log('✅ Connected to PostgreSQL'));
  pool.on('error', (err) => console.error('❌ PostgreSQL error:', err));

  // Create all tables and seed initial data
  (async () => {
    try {
      await new Promise(r => setTimeout(r, 2000));

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT, email TEXT UNIQUE, phone TEXT UNIQUE,
          password_hash TEXT, role TEXT DEFAULT 'customer',
          avatar TEXT, city TEXT, is_verified BOOLEAN DEFAULT true,
          is_active BOOLEAN DEFAULT true, is_blocked BOOLEAN DEFAULT false,
          wallet_balance REAL DEFAULT 0, loyalty_points INTEGER DEFAULT 0,
          loyalty_tier TEXT DEFAULT 'bronze', referral_code TEXT,
          fcm_token TEXT, vehicle_type TEXT, vehicle_number TEXT,
          rating REAL DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS otp_codes (
          id SERIAL PRIMARY KEY,
          phone TEXT, code TEXT, used BOOLEAN DEFAULT false,
          expires_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name_ar TEXT, name_en TEXT, icon TEXT, image TEXT,
          sort_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true
        );
        CREATE TABLE IF NOT EXISTS restaurants (
          id SERIAL PRIMARY KEY,
          name_ar TEXT, name_en TEXT, description_ar TEXT, description_en TEXT,
          logo TEXT, cover_image TEXT, phone TEXT, email TEXT,
          category_id INTEGER, rating REAL DEFAULT 0, total_reviews INTEGER DEFAULT 0,
          is_open BOOLEAN DEFAULT true, is_active BOOLEAN DEFAULT true,
          is_featured BOOLEAN DEFAULT false, is_verified BOOLEAN DEFAULT true,
          address TEXT, city TEXT, lat REAL, lng REAL,
          delivery_time_min INTEGER DEFAULT 25, delivery_time_max INTEGER DEFAULT 45,
          preparation_time_min INTEGER DEFAULT 20, preparation_time_max INTEGER DEFAULT 35,
          delivery_fee REAL DEFAULT 2, min_order REAL DEFAULT 10,
          commission_rate REAL DEFAULT 15,
          opens_at TEXT, closes_at TEXT, tags TEXT,
          owner_id INTEGER, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS menu_categories (
          id SERIAL PRIMARY KEY,
          restaurant_id INTEGER, name_ar TEXT, name_en TEXT,
          sort_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true
        );
        CREATE TABLE IF NOT EXISTS menu_items (
          id SERIAL PRIMARY KEY,
          restaurant_id INTEGER, category_id INTEGER,
          name_ar TEXT, name_en TEXT, description_ar TEXT, description_en TEXT,
          price REAL, discount_price REAL,
          image TEXT, is_available BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0,
          calories INTEGER, is_featured BOOLEAN DEFAULT false,
          is_new BOOLEAN DEFAULT false, is_spicy BOOLEAN DEFAULT false,
          is_vegetarian BOOLEAN DEFAULT false, is_vegan BOOLEAN DEFAULT false,
          preparation_time INTEGER DEFAULT 15, created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS item_options (
          id SERIAL PRIMARY KEY,
          item_id INTEGER, name_ar TEXT, name_en TEXT,
          type TEXT DEFAULT 'radio', is_required BOOLEAN DEFAULT false,
          max_selections INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS item_option_values (
          id SERIAL PRIMARY KEY,
          option_id INTEGER, name_ar TEXT, name_en TEXT,
          extra_price REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS drivers (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE,
          is_online BOOLEAN DEFAULT false, is_busy BOOLEAN DEFAULT false,
          lat REAL, lng REAL, current_lat REAL, current_lng REAL,
          vehicle_type TEXT, vehicle_number TEXT, vehicle_plate TEXT,
          national_id TEXT, license_number TEXT,
          rating REAL DEFAULT 0, total_deliveries INTEGER DEFAULT 0,
          wallet_balance REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS addresses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER, label TEXT, title TEXT, address TEXT,
          floor TEXT, notes TEXT,
          lat REAL, lng REAL, is_default BOOLEAN DEFAULT false
        );
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          order_number TEXT,
          customer_id INTEGER, restaurant_id INTEGER, driver_id INTEGER,
          status TEXT DEFAULT 'pending',
          subtotal REAL DEFAULT 0, total REAL, delivery_fee REAL DEFAULT 0,
          discount REAL DEFAULT 0, loyalty_discount REAL DEFAULT 0,
          tax REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
          commission_rate REAL DEFAULT 15,
          address_id INTEGER, delivery_address TEXT,
          delivery_lat REAL, delivery_lng REAL,
          notes TEXT, payment_method TEXT DEFAULT 'cash',
          payment_status TEXT DEFAULT 'pending',
          coupon_code TEXT, cancel_reason TEXT,
          order_type TEXT DEFAULT 'delivery',
          loyalty_points_earned INTEGER DEFAULT 0,
          loyalty_points_used INTEGER DEFAULT 0,
          estimated_delivery_time TEXT,
          restaurant_accepted_at TIMESTAMP,
          driver_assigned_at TIMESTAMP,
          picked_up_at TIMESTAMP,
          delivered_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          actual_delivery_time TEXT,
          rating_restaurant INTEGER, rating_driver INTEGER, review_text TEXT,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INTEGER, item_id INTEGER, menu_item_id INTEGER,
          name_ar TEXT, name_en TEXT, quantity INTEGER, price REAL,
          subtotal REAL DEFAULT 0, options TEXT, notes TEXT
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER, title TEXT, title_ar TEXT, title_en TEXT,
          body TEXT, body_ar TEXT, body_en TEXT,
          type TEXT, data TEXT, is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS coupons (
          id SERIAL PRIMARY KEY,
          code TEXT UNIQUE, type TEXT DEFAULT 'fixed', value REAL,
          min_order REAL DEFAULT 0, max_discount REAL,
          max_uses INTEGER DEFAULT 100, uses_count INTEGER DEFAULT 0,
          usage_limit INTEGER DEFAULT 100, usage_count INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true, expires_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS coupon_usage (
          id SERIAL PRIMARY KEY,
          coupon_id INTEGER, user_id INTEGER, order_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          order_id INTEGER UNIQUE, customer_id INTEGER, restaurant_id INTEGER,
          driver_id INTEGER, restaurant_rating INTEGER, driver_rating INTEGER,
          comment TEXT, images TEXT, created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS banners (
          id SERIAL PRIMARY KEY,
          title TEXT, title_ar TEXT, title_en TEXT,
          image TEXT, link_type TEXT, link_value TEXT,
          sort_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true,
          starts_at TIMESTAMP, ends_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS delivery_zones (
          id SERIAL PRIMARY KEY,
          name TEXT, min_km REAL DEFAULT 0, max_km REAL DEFAULT 3,
          price REAL DEFAULT 5, is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS wallet_transactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER, type TEXT, amount REAL,
          description TEXT, created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS support_tickets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER, subject TEXT, message TEXT,
          status TEXT DEFAULT 'open', created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS web_push_subscriptions (
          id SERIAL PRIMARY KEY,
          restaurant_id INTEGER, subscription TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS cart (
          id SERIAL PRIMARY KEY,
          user_id INTEGER, menu_item_id INTEGER, quantity INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS restaurant_hours (
          id SERIAL PRIMARY KEY,
          restaurant_id INTEGER, day_of_week INTEGER,
          open_time TEXT, close_time TEXT, is_closed BOOLEAN DEFAULT false
        );
      `);
      console.log('✅ All tables created/verified');

      // Seed delivery zones
      const { rows: zones } = await pool.query("SELECT COUNT(*) FROM delivery_zones");
      if (parseInt(zones[0].count) === 0) {
        await pool.query(`INSERT INTO delivery_zones (name,min_km,max_km,price) VALUES
          ('قريب (0-3 كم)',0,3,5),('متوسط (3-6 كم)',3,6,8),('بعيد (6+ كم)',6,999,12)`);
        console.log('✅ Delivery zones seeded');
      }

      // Seed categories
      const { rows: cats } = await pool.query("SELECT COUNT(*) FROM categories");
      if (parseInt(cats[0].count) === 0) {
        await pool.query(`INSERT INTO categories (name_ar,name_en,icon,sort_order) VALUES
          ('برغر','Burger','🍔',0),('بيتزا','Pizza','🍕',1),('شاورما','Shawarma','🌯',2),
          ('دجاج','Chicken','🍗',3),('مشاوي','Grills','🥩',4),('حلويات','Sweets','🍰',5),
          ('مشروبات','Drinks','🥤',6),('سلطات','Salads','🥗',7),('ماركت','Market','🛒',8),('صيدلية','Pharmacy','💊',9)`);
        console.log('✅ Categories seeded');
      }

      // Seed banner
      const { rows: bannerRows } = await pool.query("SELECT COUNT(*) FROM banners");
      if (parseInt(bannerRows[0].count) === 0) {
        await pool.query(`INSERT INTO banners (title_ar,title_en,image,link_type,link_value,sort_order,is_active)
          VALUES ('عروض خاصة','Special Offers','https://via.placeholder.com/400x160/FF6B00/FFF?text=وصلّي','none','',0,true)`);
      }

      // Ensure admin exists
      const { rows } = await pool.query("SELECT id FROM users WHERE phone='05999039704'");
      if (rows.length === 0) {
        const hash = await bcrypt.hash('123456', 10);
        await pool.query(
          `INSERT INTO users (name,phone,password_hash,role,referral_code,is_active,is_verified) VALUES ($1,$2,$3,$4,$5,true,true)`,
          ['Admin', '05999039704', hash, 'admin', 'ADM001']
        );
        console.log('✅ Admin created: 05999039704 / 123456');
      } else {
        console.log('✅ Admin exists');
      }
    } catch (e) {
      console.error('⚠️ DB setup error:', e.message);
    }
  })();

  module.exports = pool;
}
