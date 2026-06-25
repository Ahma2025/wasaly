const router = require('express').Router();
const pool = require('../config/database');

router.get('/restaurant/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, u.name as customer_name, u.avatar FROM reviews r JOIN users u ON r.customer_id=u.id WHERE r.restaurant_id=$1 AND r.is_approved=true ORDER BY r.created_at DESC LIMIT 20`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

module.exports = router;
