const router = require('express').Router();
const pool = require('../config/database');
const { serverError } = require('../utils/http');
const { auth, adminOnly } = require('../middleware/auth');
const { REVENUE_SOURCE } = require('../utils/orderService');

router.get('/overview', auth, adminOnly, async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = to || new Date().toISOString();

    const [revenue, orders, users, avgOrder] = await Promise.all([
      // 💵 الإيراد ومتوسط الطلب لكل عملية دفع: الطلبات العادية + كل طلب مجمّع مرة واحدة (بدون أبنائه)
      pool.query(`SELECT SUM(total) as total FROM ${REVENUE_SOURCE} x WHERE status='delivered' AND created_at BETWEEN $1 AND $2`, [start, end]),
      pool.query(`SELECT COUNT(*) FROM orders WHERE created_at BETWEEN $1 AND $2`, [start, end]),
      pool.query(`SELECT COUNT(*) FROM users WHERE created_at BETWEEN $1 AND $2`, [start, end]),
      pool.query(`SELECT AVG(total) as avg FROM ${REVENUE_SOURCE} x WHERE status='delivered' AND created_at BETWEEN $1 AND $2`, [start, end])
    ]);

    const hourly = await pool.query(
      `SELECT EXTRACT(HOUR FROM created_at)::INTEGER as hour, COUNT(*) as orders FROM orders WHERE created_at BETWEEN $1 AND $2 GROUP BY hour ORDER BY hour`,
      [start, end]
    );

    res.json({ success: true, data: { revenue: revenue.rows[0].total, orders: orders.rows[0].count, newUsers: users.rows[0].count, avgOrder: avgOrder.rows[0].avg, hourly: hourly.rows } });
  } catch (e) {
    serverError(res, e);
  }
});

module.exports = router;
