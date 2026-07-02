const Database = require('better-sqlite3');
const db = new Database('./wasaly.db');

const migrations = [
  'ALTER TABLE menu_items ADD COLUMN description_en TEXT',
  'ALTER TABLE menu_items ADD COLUMN calories INTEGER',
  'ALTER TABLE menu_items ADD COLUMN is_featured INTEGER DEFAULT 0',
  'ALTER TABLE menu_items ADD COLUMN is_new INTEGER DEFAULT 0',
  'ALTER TABLE menu_items ADD COLUMN is_spicy INTEGER DEFAULT 0',
  'ALTER TABLE menu_items ADD COLUMN is_vegetarian INTEGER DEFAULT 0',
  'ALTER TABLE menu_items ADD COLUMN is_vegan INTEGER DEFAULT 0',
  'ALTER TABLE menu_items ADD COLUMN preparation_time INTEGER DEFAULT 15',
  'ALTER TABLE menu_items ADD COLUMN created_at TEXT DEFAULT (datetime("now"))',
];

for (const sql of migrations) {
  try {
    db.prepare(sql).run();
    const col = sql.split('ADD COLUMN')[1].trim().split(' ')[0];
    console.log('Added:', col);
  } catch(e) {
    if (e.message.includes('duplicate column')) {
      const col = sql.split('ADD COLUMN')[1].trim().split(' ')[0];
      console.log('Already exists:', col);
    } else {
      console.log('ERROR:', e.message);
    }
  }
}

// Check/create item_options
const optCols = db.prepare('PRAGMA table_info(item_options)').all();
if (optCols.length === 0) {
  db.prepare(`CREATE TABLE item_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    type TEXT DEFAULT 'single',
    is_required INTEGER DEFAULT 0,
    max_selections INTEGER DEFAULT 1
  )`).run();
  console.log('Created: item_options');
} else {
  console.log('item_options exists:', optCols.map(c=>c.name).join(', '));
}

// Check/create item_option_values
const valCols = db.prepare('PRAGMA table_info(item_option_values)').all();
if (valCols.length === 0) {
  db.prepare(`CREATE TABLE item_option_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_id INTEGER REFERENCES item_options(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    extra_price REAL DEFAULT 0
  )`).run();
  console.log('Created: item_option_values');
} else {
  console.log('item_option_values exists:', valCols.map(c=>c.name).join(', '));
}

// Verify final menu_items columns
const finalCols = db.prepare('PRAGMA table_info(menu_items)').all();
console.log('\nFinal menu_items columns:', finalCols.map(c=>c.name).join(', '));

db.close();
console.log('\nMigration complete!');
