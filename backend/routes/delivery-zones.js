const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

// Get all zones
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM delivery_zones WHERE is_active=true ORDER BY min_km');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Calculate fee for a distance
router.get('/calculate', async (req, res) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.query;
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return res.json({ success: true, data: { fee: 5, distance_km: 0 } });
    }
    const R = 6371;
    const dLat = (parseFloat(lat2) - parseFloat(lat1)) * Math.PI / 180;
    const dLon = (parseFloat(lng2) - parseFloat(lng1)) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
      Math.cos(parseFloat(lat1)*Math.PI/180) * Math.cos(parseFloat(lat2)*Math.PI/180) * Math.sin(dLon/2)**2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const { rows } = await pool.query(
      'SELECT * FROM delivery_zones WHERE is_active=true AND min_km <= $1 AND max_km > $1 ORDER BY min_km LIMIT 1',
      [distKm]
    );
    res.json({ success: true, data: { fee: rows[0]?.price || 5, distance_km: distKm.toFixed(2), zone: rows[0] } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update zone price (admin)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { price, name, min_km, max_km } = req.body;
    await pool.query(
      'UPDATE delivery_zones SET price=$1, name=$2, min_km=$3, max_km=$4 WHERE id=$5',
      [price, name, min_km, max_km, req.params.id]
    );
    const { rows } = await pool.query('SELECT * FROM delivery_zones WHERE id=$1', [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Create zone (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { price, name, min_km, max_km } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO delivery_zones (name, min_km, max_km, price) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, min_km, max_km, price]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete zone (admin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM delivery_zones WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
