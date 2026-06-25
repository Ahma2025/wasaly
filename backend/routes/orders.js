const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly, driverOnly } = require('../middleware/auth');
const { saveNotification, sendPush, notifyUser } = require('../utils/notifications');

const generateOrderNumber = () => 'WSL' + Date.now().toString().slice(-8);

// Place order
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { restaurant_id, address_id, items, payment_method, notes, coupon_code, loyalty_points_to_use, delivery_address, delivery_lat, delivery_lng } = req.body;

    // Validate restaurant
    const { rows: restaurants } = await client.query('SELECT * FROM restaurants WHERE id=$1 AND is_active=true AND is_open=true', [restaurant_id]);
    if (!restaurants[0]) return res.status(400).json({ success: false, message: 'Restaurant unavailable' });
    const restaurant = restaurants[0];

    // Calculate subtotal
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const { rows: menuItems } = await client.query('SELECT * FROM menu_items WHERE id=$1 AND is_available=true', [item.id]);
      if (!menuItems[0]) throw new Error(`Item not available: ${item.id}`);
      const menuItem = menuItems[0];
      const itemTotal = (menuItem.discount_price || menuItem.price) * item.quantity;
      subtotal += itemTotal;
      orderItems.push({ ...menuItem, quantity: item.quantity, options: item.options, notes: item.notes, subtotal: itemTotal });
    }

    if (subtotal < restaurant.min_order) {
      throw new Error(`Minimum order is ${restaurant.min_order}`);
    }

    // Coupon
    let discount = 0;
    let couponId = null;
    if (coupon_code) {
      const { rows: coupons } = await client.query(
        `SELECT * FROM coupons WHERE code=$1 AND is_active=true AND (expires_at IS NULL OR expires_at > NOW())
         AND (usage_limit IS NULL OR usage_count < usage_limit) AND min_order <= $2`,
        [coupon_code, subtotal]
      );
      if (coupons[0]) {
        const coupon = coupons[0];
        couponId = coupon.id;
        if (coupon.type === 'percentage') discount = Math.min(subtotal * coupon.value / 100, coupon.max_discount || Infinity);
        else if (coupon.type === 'fixed') discount = Math.min(coupon.value, subtotal);
        else if (coupon.type === 'free_delivery') discount = restaurant.delivery_fee;
        await client.query('UPDATE coupons SET usage_count = usage_count + 1 WHERE id=$1', [couponId]);
      }
    }

    // Loyalty points
    let loyaltyDiscount = 0;
    let pointsUsed = 0;
    if (loyalty_points_to_use && loyalty_points_to_use > 0) {
      const pointsAvailable = Math.min(loyalty_points_to_use, req.user.loyalty_points);
      loyaltyDiscount = pointsAvailable * 0.01; // 1 point = 0.01
      pointsUsed = pointsAvailable;
    }

    const deliveryFee = discount > 0 && coupon_code ? (discount === restaurant.delivery_fee ? 0 : restaurant.delivery_fee) : restaurant.delivery_fee;
    const tax = (subtotal - discount) * 0.05;
    const total = Math.max(0, subtotal + deliveryFee - discount - loyaltyDiscount + tax);
    const pointsEarned = Math.floor(total * 10);
    const estimatedTime = new Date(Date.now() + (restaurant.delivery_time_max || 45) * 60 * 1000);

    // Create order
    const { rows: orders } = await client.query(
      `INSERT INTO orders (order_number, customer_id, restaurant_id, address_id, delivery_address, delivery_lat, delivery_lng,
        payment_method, subtotal, delivery_fee, discount, loyalty_discount, tax, total, notes, coupon_code,
        estimated_delivery_time, loyalty_points_earned, loyalty_points_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [generateOrderNumber(), req.user.id, restaurant_id, address_id, delivery_address, delivery_lat, delivery_lng,
       payment_method, subtotal, deliveryFee, discount, loyaltyDiscount, tax, total, notes, coupon_code,
       estimatedTime, pointsEarned, pointsUsed]
    );
    const order = orders[0];

    // Insert order items
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, item_id, name_ar, name_en, price, quantity, options, notes, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [order.id, item.id, item.name_ar, item.name_en, item.discount_price || item.price, item.quantity, JSON.stringify(item.options || []), item.notes, item.subtotal]
      );
    }

    // Update loyalty points
    if (pointsUsed > 0) {
      await client.query('UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id=$2', [pointsUsed, req.user.id]);
    }

    // Handle wallet payment
    if (payment_method === 'wallet') {
      if (req.user.wallet_balance < total) throw new Error('Insufficient wallet balance');
      await client.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id=$2', [total, req.user.id]);
      await client.query('UPDATE orders SET payment_status=$1 WHERE id=$2', ['paid', order.id]);
    }

    // Coupon usage log
    if (couponId) {
      await client.query('INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES ($1,$2,$3)', [couponId, req.user.id, order.id]);
    }

    await client.query('COMMIT');

    // Notify restaurant
    notifyUser(req.io, restaurant.owner_id, 'new_order', { order_id: order.id, order_number: order.order_number });
    saveNotification(restaurant.owner_id, 'طلب جديد', 'New Order', `طلب جديد #${order.order_number}`, `New order #${order.order_number}`, 'new_order', { order_id: order.id });

    res.status(201).json({ success: true, data: order });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: e.message });
  } finally {
    client.release();
  }
});

// Get user orders
router.get('/my', auth, async (req, res) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;
    let q = `SELECT o.*, r.name_ar as restaurant_name, r.logo as restaurant_logo
             FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
             WHERE o.customer_id=$1`;
    const params = [req.user.id];
    if (status) { q += ` AND o.status=$2`; params.push(status); }
    q += ` ORDER BY o.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get order detail
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: orders } = await pool.query(
      `SELECT o.*, r.name_ar as restaurant_name, r.logo, r.lat as restaurant_lat, r.lng as restaurant_lng,
              r.phone as restaurant_phone, u.name as driver_name, u.phone as driver_phone,
              d.current_lat as driver_lat, d.current_lng as driver_lng, d.vehicle_type
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.driver_id=u.id LEFT JOIN drivers d ON d.user_id=o.driver_id
       WHERE o.id=$1`,
      [req.params.id]
    );
    if (!orders[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
    res.json({ success: true, data: { ...orders[0], items } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update order status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['ready'],
      ready: ['picked_up'],
      picked_up: ['on_the_way'],
      on_the_way: ['delivered']
    };

    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    const order = orders[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status transition' });
    }

    const timeField = {
      confirmed: 'restaurant_accepted_at',
      picked_up: 'picked_up_at',
      delivered: 'delivered_at',
      cancelled: 'cancelled_at'
    };

    let q = `UPDATE orders SET status=$1, updated_at=NOW()`;
    const params = [status, req.params.id];
    if (timeField[status]) q += `, ${timeField[status]}=NOW()`;

    if (status === 'delivered') {
      q += `, actual_delivery_time=NOW()`;
      // Award loyalty points
      await pool.query('UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id=$2', [order.loyalty_points_earned, order.customer_id]);
      await pool.query('UPDATE orders SET payment_status=$1 WHERE id=$2 AND payment_method=$3', ['paid', order.id, 'cash']);
    }

    q += ` WHERE id=$2 RETURNING *`;
    const { rows } = await pool.query(q, params);

    notifyUser(req.io, order.customer_id, 'order_status', { order_id: order.id, status });

    const statusMessages = {
      confirmed: ['تم قبول طلبك', 'Your order is confirmed'],
      preparing: ['جاري تحضير طلبك', 'Your order is being prepared'],
      on_the_way: ['طلبك في الطريق إليك', 'Your order is on the way'],
      delivered: ['تم توصيل طلبك', 'Order delivered!'],
      cancelled: ['تم إلغاء طلبك', 'Order cancelled']
    };

    if (statusMessages[status]) {
      saveNotification(order.customer_id, statusMessages[status][0], statusMessages[status][1], statusMessages[status][0], statusMessages[status][1], 'order_status', { order_id: order.id });
    }

    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Rate order
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { restaurant_rating, driver_rating, comment, images } = req.body;
    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2 AND status=$3', [req.params.id, req.user.id, 'delivered']);
    if (!orders[0]) return res.status(404).json({ success: false, message: 'Order not found or not delivered' });
    const order = orders[0];

    await pool.query(
      `INSERT INTO reviews (order_id, customer_id, restaurant_id, driver_id, restaurant_rating, driver_rating, comment, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (order_id) DO NOTHING`,
      [order.id, req.user.id, order.restaurant_id, order.driver_id, restaurant_rating, driver_rating, comment, images]
    );
    await pool.query(`UPDATE orders SET rating_restaurant=$1, rating_driver=$2, review_text=$3 WHERE id=$4`, [restaurant_rating, driver_rating, comment, order.id]);

    // Update restaurant rating
    await pool.query(`UPDATE restaurants SET
      rating = (SELECT AVG(restaurant_rating) FROM reviews WHERE restaurant_id=$1),
      rating_count = (SELECT COUNT(*) FROM reviews WHERE restaurant_id=$1) WHERE id=$1`, [order.restaurant_id]);

    res.json({ success: true, message: 'Review submitted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Cancel order
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [req.params.id, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel at this stage' });
    }

    await pool.query(`UPDATE orders SET status='cancelled', cancel_reason=$1, cancelled_at=NOW() WHERE id=$2`, [reason, order.id]);

    // Refund wallet if paid by wallet
    if (order.payment_method === 'wallet' && order.payment_status === 'paid') {
      await pool.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id=$2', [order.total, order.customer_id]);
    }

    res.json({ success: true, message: 'Order cancelled' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Reorder
router.post('/:id/reorder', auth, async (req, res) => {
  try {
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
    res.json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
