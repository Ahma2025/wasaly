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

  // Seed users/data only once
  const adminExists = db.prepare("SELECT id FROM users WHERE phone='0599039704'").get();
  if (!adminExists) {
    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('Ahmad Jamal', '0599039704', bcrypt.hashSync('123456', 10), 'admin', 'ADMIN00');
    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('مدير النظام', '0599000000', bcrypt.hashSync('admin123', 10), 'admin', 'ADMIN01');
    console.log('✅ Admin users created');

    const cats = [
      ['برغر', 'Burger', '🍔'],
      ['بيتزا', 'Pizza', '🍕'],
      ['شاورما', 'Shawarma', '🌯'],
      ['دجاج', 'Chicken', '🍗'],
      ['مشاوي', 'Grills', '🥩'],
      ['حلويات', 'Sweets', '🍰'],
      ['مشروبات', 'Drinks', '🥤'],
      ['سلطات', 'Salads', '🥗'],
      ['ماركت', 'Market', '🛒'],
      ['صيدلية', 'Pharmacy', '💊'],
    ];
    cats.forEach(([name_ar, name_en, icon], i) => {
      db.prepare(`INSERT OR IGNORE INTO categories (name_ar,name_en,icon,sort_order) VALUES (?,?,?,?)`)
        .run(name_ar, name_en, icon, i);
    });

    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('أبو أحمد', '0599111001', bcrypt.hashSync('rest123', 10), 'restaurant_owner', 'REST01');
    const ownerRow = db.prepare("SELECT id FROM users WHERE phone='0599111001'").get();

    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('محمد السائق', '0599222001', bcrypt.hashSync('driver123', 10), 'driver', 'DRV01');
    const driverRow = db.prepare("SELECT id FROM users WHERE phone='0599222001'").get();
    if (driverRow) {
      db.prepare(`INSERT OR IGNORE INTO drivers (user_id,vehicle_type,rating) VALUES (?,?,?)`)
        .run(driverRow.id, 'دراجة', 4.8);
    }

    const catBurger = db.prepare("SELECT id FROM categories WHERE name_ar='برغر'").get();
    const catPizza = db.prepare("SELECT id FROM categories WHERE name_ar='بيتزا'").get();
    const catChicken = db.prepare("SELECT id FROM categories WHERE name_ar='دجاج'").get();

    const sampleRestaurants = [
      { name_ar: 'برغر وصلّي', desc: 'أشهى البرغر في المدينة', cat: catBurger?.id, city: 'رام الله', rating: 4.8, fee: 5, min: 15, featured: 1, lat: 31.9022, lng: 35.2097 },
      { name_ar: 'بيتزا بالو', desc: 'بيتزا إيطالية أصيلة', cat: catPizza?.id, city: 'رام الله', rating: 4.5, fee: 8, min: 20, featured: 0, lat: 31.8990, lng: 35.2120 },
      { name_ar: 'دجاج ماستر', desc: 'دجاج مقلي ومشوي', cat: catChicken?.id, city: 'نابلس', rating: 4.3, fee: 5, min: 15, featured: 0, lat: 31.9050, lng: 35.2060 },
    ];

    sampleRestaurants.forEach(r => {
      const restId = db.prepare(
        `INSERT INTO restaurants (name_ar,description_ar,category_id,city,address,rating,delivery_fee,min_order,is_featured,owner_id,delivery_time_min,delivery_time_max,lat,lng)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(r.name_ar, r.desc, r.cat, r.city, 'شارع المطاعم', r.rating, r.fee, r.min, r.featured, ownerRow?.id, 20, 35, r.lat || 31.9, r.lng || 35.2).lastInsertRowid;

      const catId = db.prepare(`INSERT INTO menu_categories (restaurant_id,name_ar,sort_order) VALUES (?,?,?)`)
        .run(restId, 'الأصناف الرئيسية', 0).lastInsertRowid;

      const items = r.name_ar.includes('برغر')
        ? [['برغر كلاسيك', 25, null], ['برغر دبل', 35, 30], ['برغر تشيز', 30, null], ['برغر مشروم', 33, 28]]
        : r.name_ar.includes('بيتزا')
        ? [['بيتزا مارغريتا', 28, null], ['بيتزا بيبروني', 35, 30], ['بيتزا خضار', 30, null]]
        : [['وجبة دجاج', 25, null], ['دجاج مقلي', 20, null], ['دجاج مشوي', 22, null]];

      items.forEach(([name_ar, price, discount_price]) => {
        const itemId = db.prepare(`INSERT INTO menu_items (restaurant_id,category_id,name_ar,price,discount_price) VALUES (?,?,?,?,?)`)
          .run(restId, catId, name_ar, price, discount_price).lastInsertRowid;

        // Add sample options to burger items
        if (r.name_ar.includes('برغر')) {
          const optId = db.prepare(`INSERT INTO item_options (item_id,name_ar,type,is_required) VALUES (?,?,?,?)`)
            .run(itemId, 'الحجم', 'radio', 0).lastInsertRowid;
          db.prepare(`INSERT INTO item_option_values (option_id,name_ar,extra_price) VALUES (?,?,?)`).run(optId, 'عادي', 0);
          db.prepare(`INSERT INTO item_option_values (option_id,name_ar,extra_price) VALUES (?,?,?)`).run(optId, 'كبير', 5);

          const extrasId = db.prepare(`INSERT INTO item_options (item_id,name_ar,type,is_required) VALUES (?,?,?,?)`)
            .run(itemId, 'إضافات', 'checkbox', 0).lastInsertRowid;
          db.prepare(`INSERT INTO item_option_values (option_id,name_ar,extra_price) VALUES (?,?,?)`).run(extrasId, 'جبنة إضافية', 2);
          db.prepare(`INSERT INTO item_option_values (option_id,name_ar,extra_price) VALUES (?,?,?)`).run(extrasId, 'صلصة حارة', 0);
          db.prepare(`INSERT INTO item_option_values (option_id,name_ar,extra_price) VALUES (?,?,?)`).run(extrasId, 'بيكون', 3);
        }
      });
    });

    db.prepare(`INSERT INTO banners (title_ar,title_en,image,link_type,link_value,sort_order,is_active) VALUES (?,?,?,?,?,?,?)`)
      .run('عروض خاصة', 'Special Offers', 'https://via.placeholder.com/400x160/FF6B00/FFF?text=وصلّي', 'none', '', 0, 1);

    // Seed test customer
    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('أحمد الزبون', '0599333001', bcrypt.hashSync('test123', 10), 'customer', 'CUST01');

    // Seed Wasaly test accounts (used in TestFlight testing)
    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('زبون تجريبي', '0599039707', bcrypt.hashSync('123456', 10), 'customer', 'WCUST1');
    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('مندوب تجريبي', '0599039706', bcrypt.hashSync('123456', 10), 'driver', 'WDRV01');
    db.prepare(`INSERT OR IGNORE INTO users (name,phone,password_hash,role,referral_code) VALUES (?,?,?,?,?)`)
      .run('مطعم تجريبي', '0599039705', bcrypt.hashSync('123456', 10), 'restaurant', 'WREST1');
    console.log('✅ Wasaly test accounts created');

    console.log('✅ Sample data created');
  } else {
    const existingAdmin = db.prepare("SELECT id,password_hash FROM users WHERE phone='0599039704'").get();
    if (existingAdmin && !existingAdmin.password_hash) {
      db.prepare("UPDATE users SET password_hash=?,role='admin' WHERE phone='0599039704'")
        .run(bcrypt.hashSync('123456', 10));
    }
  }

  // Always ensure NEW test accounts exist (runs every startup)
  const hash123456 = bcrypt.hashSync('123456', 10);
  const newAccounts = [
    ['Customer Test', '05999039701', 'customer',   'CUST01'],
    ['Driver Test',   '05999039702', 'driver',     'DRV001'],
    ['Restaurant Test','05999039703','restaurant', 'REST01'],
    ['Admin Test',    '05999039704', 'admin',      'ADM001'],
  ];
  newAccounts.forEach(([name, phone, role, ref]) => {
    const exists = db.prepare('SELECT id FROM users WHERE phone=?').get(phone);
    if (!exists) {
      db.prepare('INSERT INTO users (name,phone,password_hash,role,referral_code,is_active,is_verified) VALUES (?,?,?,?,?,1,1)')
        .run(name, phone, hash123456, role, ref);
      console.log(`✅ Test account created: ${phone} / ${role}`);
    }
  });
  // Remove old broken test accounts
  ['0599039705','0599039706','0599039707'].forEach(p => {
    db.prepare('DELETE FROM users WHERE phone=?').run(p);
  });

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
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  pool.on('connect', () => console.log('✅ Connected to PostgreSQL'));
  pool.on('error', (err) => console.error('❌ PostgreSQL error:', err));
  module.exports = pool;
}
