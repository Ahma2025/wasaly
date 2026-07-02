const pool = require('./config/database');

async function test() {
  try {
    const r = await pool.query(
      'UPDATE restaurants SET opens_at=$1, closes_at=$2, phone=$3 WHERE id=$4',
      ['09:00', '22:00', '0599039704', 1]
    );
    console.log('UPDATE OK, changes:', r.rowCount);
  } catch(e) {
    console.error('ERROR:', e.message);
  }

  // Also test the full settings save like the portal does
  try {
    const allowed = ['name_ar','name_en','description_ar','description_en','phone','address','min_order','delivery_fee','delivery_time_min','delivery_time_max','is_open','opens_at','closes_at','tags','lat','lng','logo'];
    const body = { opens_at: '09:00', closes_at: '22:00', phone: '0599039704' };
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates.push(`${key}=$${idx++}`);
        values.push(body[key]);
      }
    }
    updates.push(`updated_at=NOW()`);
    values.push(1);
    const sql = `UPDATE restaurants SET ${updates.join(',')} WHERE id=$${idx}`;
    console.log('SQL:', sql);
    console.log('Values:', values);
    const r2 = await pool.query(sql, values);
    console.log('Full update OK:', r2.rowCount);
  } catch(e) {
    console.error('Full update ERROR:', e.message);
  }
  process.exit(0);
}
test();
