const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { saveNotification, notifyUser, Notify, sendFCM, getUserTokens } = require('../utils/notifications');
const { sendWebPush } = require('./webpush');

const generateOrderNumber = () => 'WSL' + Date.now().toString().slice(-8);

// Calculate delivery fee based on zones
async function getDeliveryFee(restaurantLat, restaurantLng, deliveryLat, deliveryLng) {
  try {
    if (!restaurantLat || !restaurantLng || !deliveryLat || !deliveryLng) return 5;
    const R = 6371;
    const dLat = (deliveryLat - restaurantLat) * Math.PI / 180;
    const dLon = (deliveryLng - restaurantLng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(restaurantLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const { rows: zones } = await pool.query(
      'SELECT * FROM delivery_zones WHERE is_active=true AND min_km <= $1 AND max_km > $1 ORDER BY min_km LIMIT 1',
      [distKm]
    );
    return zones[0]?.price || 5;
  } catch (e) { return 5; }
}

// Find nearest available driver and notify them
async function assignDriverToOrder(io, orderId, restaurantLat, restaurantLng, excludeDriverIds = []) {
  try {
    let q = `SELECT d.*, u.name, u.phone, u.fcm_token FROM drivers d
             JOIN users u ON d.user_id=u.id
             WHERE d.is_online=true AND d.is_busy=false`;
    if (excludeDriverIds.length > 0) {
      q += ` AND d.user_id NOT IN (${excludeDriverIds.join(',')})`;
    }
    q += ` ORDER BY (
      (d.current_lat - ${restaurantLat || 31.9}) * (d.current_lat - ${restaurantLat || 31.9}) +
      (d.current_lng - ${restaurantLng || 35.2}) * (d.current_lng - ${restaurantLng || 35.2})
    ) ASC LIMIT 1`;

    const { rows: drivers } = await pool.query(q, []);
    if (!drivers[0]) return null;

    const driver = drivers[0];

    // Store pending driver FIRST, then notify (avoid race condition on accept)
    await pool.query('UPDATE orders SET driver_id=$1 WHERE id=$2', [driver.user_id, orderId]);

    notifyUser(io, driver.user_id, 'new_order_request', {
      order_id: orderId,
      restaurant_lat: restaurantLat,
      restaurant_lng: restaurantLng
    });
    // Also send FCM push so driver gets it even when app is backgrounded
    try {
      const tokens = await getUserTokens(driver.user_id);
      if (tokens.length) await sendFCM(tokens, '🛵 طلب توصيل جديد!', 'يوجد طلب جديد بانتظارك، اقبل الآن!', { type: 'new_order_request', order_id: String(orderId) }, 'com.wasaly.driver');
    } catch (e) { console.error('FCM push to driver failed:', e.message); }

    // Auto-reject after 60s if not accepted
    setTimeout(async () => {
      const { rows } = await pool.query(
        "SELECT status, driver_id FROM orders WHERE id=$1", [orderId]
      );
      if (rows[0] && rows[0].status === 'confirmed' && rows[0].driver_id === driver.user_id) {
        await pool.query('UPDATE orders SET driver_id=NULL WHERE id=$1', [orderId]);
        assignDriverToOrder(io, orderId, restaurantLat, restaurantLng, [...excludeDriverIds, driver.user_id]);
      }
    }, 60000);

    return driver;
  } catch (e) { console.error('assignDriver error:', e.message); return null; }
}

// Place order
router.post('/', auth, async (req, res) => {
  try {
    const {
      restaurant_id, address_id, items, payment_method = 'cash',
      notes, coupon_code, delivery_address, delivery_lat, delivery_lng,
      order_type = 'delivery'
    } = req.body;

    const { rows: restaurants } = await pool.query(
      'SELECT * FROM restaurants WHERE id=$1 AND is_active=true', [restaurant_id]
    );
    if (!restaurants[0]) return res.status(400).json({ success: false, message: 'المطعم غير متاح' });
    const restaurant = restaurants[0];

    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const { rows: menuItems } = await pool.query(
        'SELECT * FROM menu_items WHERE id=$1 AND is_available=true', [item.id]
      );
      if (!menuItems[0]) return res.status(400).json({ success: false, message: `الصنف ${item.id} غير متاح` });
      const mi = menuItems[0];
      const itemPrice = mi.discount_price || mi.price;
      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;
      orderItems.push({ ...mi, quantity: item.quantity, options: item.options, notes: item.notes, subtotal: itemTotal });
    }

    if (subtotal < (restaurant.min_order || 0)) {
      return res.status(400).json({ success: false, message: `الحد الأدنى للطلب ${restaurant.min_order}₪` });
    }

    let discount = 0;
    if (coupon_code) {
      const { rows: coupons } = await pool.query(
        `SELECT * FROM coupons WHERE code=$1 AND is_active=true AND min_order <= $2
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (usage_limit IS NULL OR usage_count < usage_limit)`,
        [coupon_code, subtotal]
      );
      if (coupons[0]) {
        const c = coupons[0];
        if (c.type === 'percentage') discount = Math.min(subtotal * c.value / 100, c.max_discount || subtotal);
        else if (c.type === 'fixed') discount = Math.min(c.value, subtotal);
        await pool.query('UPDATE coupons SET usage_count = usage_count + 1 WHERE code=$1', [coupon_code]);
      }
    }

    let deliveryFee = 0;
    if (order_type === 'delivery') {
      deliveryFee = await getDeliveryFee(restaurant.lat, restaurant.lng, delivery_lat, delivery_lng);
    }

    const total = Math.max(0, subtotal + deliveryFee - discount);
    const pointsEarned = Math.floor(total * 10);
    const orderNumber = generateOrderNumber();

    const { rows: newOrders } = await pool.query(
      `INSERT INTO orders (order_number, customer_id, restaurant_id, address_id, delivery_address,
        delivery_lat, delivery_lng, payment_method, subtotal, delivery_fee, discount, total, notes,
        coupon_code, estimated_delivery_time, loyalty_points_earned, order_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [orderNumber, req.user.id, restaurant_id, address_id, delivery_address,
       delivery_lat, delivery_lng, payment_method, subtotal, deliveryFee, discount, total, notes,
       coupon_code, new Date(Date.now() + (restaurant.delivery_time_max || 45) * 60 * 1000).toISOString(),
       pointsEarned, order_type, 'pending']
    );
    const order = newOrders[0];

    for (const item of orderItems) {
      await pool.query(
        `INSERT INTO order_items (order_id, item_id, menu_item_id, name_ar, price, quantity, subtotal, options, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [order.id, item.id, item.id, item.name_ar, item.discount_price || item.price,
         item.quantity, item.subtotal, JSON.stringify(item.options || []), item.notes || '']
      );
    }

    // Notify restaurant owner (socket + push)
    if (restaurant.owner_id) {
      notifyUser(req.io, restaurant.owner_id, 'new_order', { order_id: order.id, order_number: orderNumber });
      saveNotification(restaurant.owner_id, `طلب جديد #${orderNumber}`, 'new_order', { order_id: order.id });
      try {
        const tokens = await getUserTokens(restaurant.owner_id);
        if (tokens.length) await sendFCM(tokens, '🛎️ طلب جديد!', `طلب #${orderNumber} ينتظر موافقتك`, { type: 'new_order', order_id: String(order.id) }, 'com.wasaly.restaurant');
      } catch (e) { console.error('FCM push to restaurant failed:', e.message); }
      // Web Push for restaurant portal (browser)
      sendWebPush(restaurant.id, '🛎️ طلب جديد!', `طلب #${orderNumber} ينتظر موافقتك`, { order_id: order.id }).catch(() => {});
    }

    res.status(201).json({ success: true, data: order });
  } catch (e) {
    console.error('POST /orders error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get user orders
router.get('/my', auth, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    let q = `SELECT o.*, r.name_ar as restaurant_name, r.logo as restaurant_logo,
             (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) as items_count
             FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
             WHERE o.customer_id=$1`;
    const params = [req.user.id];
    if (status === 'active') {
      q += ` AND o.status NOT IN ('delivered','cancelled')`;
    } else if (status === 'past') {
      q += ` AND o.status IN ('delivered','cancelled')`;
    } else if (status) {
      q += ` AND o.status=$2`; params.push(status);
    }
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
              d.current_lat as driver_lat, d.current_lng as driver_lng, d.vehicle_type, d.vehicle_plate,
              cu.phone as customer_phone, cu.name as customer_name
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.driver_id=u.id LEFT JOIN drivers d ON d.user_id=o.driver_id
       LEFT JOIN users cu ON o.customer_id=cu.id
       WHERE o.id=$1`,
      [req.params.id]
    );
    if (!orders[0]) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
    res.json({ success: true, data: { ...orders[0], items } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Restaurant confirms order → find driver
router.patch('/:id/confirm', auth, async (req, res) => {
  try {
    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    const order = orders[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    await pool.query(
      `UPDATE orders SET status='confirmed', restaurant_accepted_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [order.id]
    );

    if (order.order_type === 'delivery') {
      const { rows: restaurants } = await pool.query('SELECT lat, lng FROM restaurants WHERE id=$1', [order.restaurant_id]);
      const rest = restaurants[0];
      await assignDriverToOrder(req.io, order.id, rest?.lat, rest?.lng);
    }

    notifyUser(req.io, order.customer_id, 'order_status', { order_id: order.id, status: 'confirmed' });
    try { await Notify.orderConfirmed(req.io, order.customer_id, order.id); } catch (e) { console.error('notify confirm err:', e.message); }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update order status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    const order = orders[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    const timeFields = {
      confirmed: 'restaurant_accepted_at',
      picked_up: 'picked_up_at',
      on_the_way: 'picked_up_at',
      delivered: 'delivered_at',
      cancelled: 'cancelled_at'
    };

    let setClause = `status=$1, updated_at=NOW()`;
    const params = [status, order.id];
    if (timeFields[status]) {
      setClause += `, ${timeFields[status]}=NOW()`;
    }
    if (status === 'delivered') {
      setClause += `, actual_delivery_time=NOW(), payment_status='paid'`;
      // Free up driver
      await pool.query('UPDATE drivers SET is_busy=false WHERE user_id=$1', [order.driver_id]);
      // Add earnings to driver
      await pool.query('UPDATE drivers SET wallet_balance=wallet_balance+$1 WHERE user_id=$2', [order.delivery_fee, order.driver_id]);
    }

    await pool.query(`UPDATE orders SET ${setClause} WHERE id=$2`, params);

    notifyUser(req.io, order.customer_id, 'order_status', { order_id: order.id, status });
    try {
      if (status === 'on_the_way') await Notify.orderOnTheWay(req.io, order.customer_id, order.id);
      else if (status === 'delivered') await Notify.orderDelivered(req.io, order.customer_id, order.id);
      else if (status === 'cancelled') await Notify.orderCancelled(req.io, order.customer_id, order.id);
      else {
        const msgs = { preparing: 'جاري تحضير طلبك 🍳' };
        if (msgs[status]) saveNotification(order.customer_id, msgs[status], 'order_status', { order_id: order.id });
      }
    } catch (e) { console.error('notify status err:', e.message); }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver accepts order
router.post('/:id/accept', auth, async (req, res) => {
  try {
    // Allow accepting if status is 'confirmed' OR already 'preparing' by this driver (idempotent retry)
    const { rows: orders } = await pool.query(
      "SELECT * FROM orders WHERE id=$1 AND driver_id=$2 AND status IN ('confirmed','preparing')",
      [req.params.id, req.user.id]
    );
    if (!orders[0]) return res.status(400).json({ success: false, message: 'الطلب غير متاح' });

    const order = orders[0];

    // Only update if still 'confirmed' (avoid double-update)
    if (order.status === 'confirmed') {
      await pool.query(
        `UPDATE orders SET status='preparing', driver_assigned_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [req.params.id]
      );
      await pool.query('UPDATE drivers SET is_busy=true WHERE user_id=$1', [req.user.id]);

      // Notifications — don't let these fail the whole request
      try {
        notifyUser(req.io, order.customer_id, 'driver_assigned', { order_id: order.id, driver_id: req.user.id });
        const { rows: driverInfo } = await pool.query(
          'SELECT u.name, d.vehicle_type FROM users u JOIN drivers d ON d.user_id=u.id WHERE u.id=$1',
          [req.user.id]
        );
        await Notify.driverAssigned(req.io, order.customer_id, driverInfo[0]?.name || 'السائق', order.id);
      } catch (notifErr) {
        console.error('accept notification error (non-fatal):', notifErr.message);
      }
    }

    res.json({ success: true, order_id: order.id });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver rejects order
router.post('/:id/reject', auth, async (req, res) => {
  try {
    const { rows: orders } = await pool.query(
      "SELECT * FROM orders WHERE id=$1 AND driver_id=$2", [req.params.id, req.user.id]
    );
    if (!orders[0]) return res.status(400).json({ success: false, message: 'الطلب غير موجود' });

    const order = orders[0];
    await pool.query('UPDATE orders SET driver_id=NULL WHERE id=$1', [order.id]);

    const { rows: restaurants } = await pool.query('SELECT lat, lng FROM restaurants WHERE id=$1', [order.restaurant_id]);
    assignDriverToOrder(req.io, order.id, restaurants[0]?.lat, restaurants[0]?.lng, [req.user.id]);

    res.json({ success: true });
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
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب في هذه المرحلة' });
    }
    await pool.query(
      `UPDATE orders SET status='cancelled', cancel_reason=$1, cancelled_at=NOW() WHERE id=$2`,
      [reason || '', order.id]
    );
    if (order.driver_id) {
      await pool.query('UPDATE drivers SET is_busy=false WHERE user_id=$1', [order.driver_id]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Rate order
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { restaurant_rating, driver_rating, comment } = req.body;
    const { rows: orders } = await pool.query(
      "SELECT * FROM orders WHERE id=$1 AND customer_id=$2 AND status='delivered'",
      [req.params.id, req.user.id]
    );
    if (!orders[0]) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const order = orders[0];

    await pool.query(
      `INSERT INTO reviews (order_id, customer_id, restaurant_id, driver_id, restaurant_rating, driver_rating, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (order_id) DO NOTHING`,
      [order.id, req.user.id, order.restaurant_id, order.driver_id, restaurant_rating, driver_rating, comment]
    );
    await pool.query(
      'UPDATE orders SET rating_restaurant=$1, rating_driver=$2, review_text=$3 WHERE id=$4',
      [restaurant_rating, driver_rating, comment, order.id]
    );
    await pool.query(
      `UPDATE restaurants SET
        rating = (SELECT AVG(restaurant_rating) FROM reviews WHERE restaurant_id=$1 AND restaurant_rating IS NOT NULL),
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE restaurant_id=$1) WHERE id=$1`,
      [order.restaurant_id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
module.exports.assignDriverToOrder = assignDriverToOrder;
