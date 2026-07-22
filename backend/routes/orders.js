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
    const safeLat = parseFloat(restaurantLat) || 31.9;
    const safeLng = parseFloat(restaurantLng) || 35.2;
    const params = [safeLat, safeLng];
    let paramIdx = 3;

    let q = `SELECT d.*, u.name, u.phone, u.fcm_token FROM drivers d
             JOIN users u ON d.user_id=u.id
             WHERE d.is_online=true AND d.is_busy=false`;
    if (excludeDriverIds.length > 0) {
      params.push(excludeDriverIds);
      q += ` AND NOT (d.user_id = ANY($${paramIdx++}::uuid[]))`;
    }
    q += ` ORDER BY (
      (d.current_lat - $1) * (d.current_lat - $1) +
      (d.current_lng - $2) * (d.current_lng - $2)
    ) ASC LIMIT 1`;

    const { rows: drivers } = await pool.query(q, params);
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
      order_type = 'delivery', tip = 0,
      redeem_points = 0, use_wallet = false
    } = req.body;
    const tipAmount = Math.max(0, parseFloat(tip) || 0);

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
      const basePrice = parseFloat(mi.discount_price || mi.price || 0);
      const addonsPrice = (item.options || []).reduce((s, o) => s + parseFloat(o.price || 0), 0);
      const itemPrice = basePrice + addonsPrice;
      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;
      orderItems.push({ ...mi, quantity: item.quantity, options: item.options, notes: item.notes, subtotal: itemTotal, unitPrice: itemPrice });
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

    // 🎁 خصم أول طلب — إذا ما إله أي طلب سابق
    let firstOrderDiscount = 0;
    try {
      const { rows: prev } = await pool.query('SELECT COUNT(*)::int AS c FROM orders WHERE customer_id=$1', [req.user.id]);
      if (prev[0] && prev[0].c === 0) {
        firstOrderDiscount = Math.min(10, subtotal * 0.15); // 15% حتى 10₪
        discount += firstOrderDiscount;
      }
    } catch (e) {}

    // 🚚 توصيل مجاني فوق 50₪
    const FREE_DELIVERY_THRESHOLD = 50;
    if (order_type === 'delivery' && subtotal >= FREE_DELIVERY_THRESHOLD) {
      deliveryFee = 0;
    }

    // 🏆 استبدال نقاط الولاء (100 نقطة = 5₪)
    let pointsRedeemed = 0, redeemValue = 0;
    const wantRedeem = Math.max(0, parseInt(redeem_points) || 0);
    if (wantRedeem > 0) {
      const { rows: ur } = await pool.query('SELECT loyalty_points FROM users WHERE id=$1', [req.user.id]);
      const available = parseInt(ur[0]?.loyalty_points || 0);
      const usablePoints = Math.min(wantRedeem, available);
      const maxValue = Math.max(0, subtotal + deliveryFee - discount);
      redeemValue = Math.min(usablePoints * 0.05, maxValue);
      pointsRedeemed = Math.round(redeemValue / 0.05);
    }

    const dueBeforeWallet = Math.max(0, subtotal + deliveryFee - discount - redeemValue) + tipAmount;

    // 💳 دفع جزئي من المحفظة
    let walletUsed = 0;
    if (use_wallet) {
      const { rows: uw } = await pool.query('SELECT wallet_balance FROM users WHERE id=$1', [req.user.id]);
      const bal = parseFloat(uw[0]?.wallet_balance || 0);
      walletUsed = Math.min(bal, dueBeforeWallet);
    }

    const total = Math.max(0, dueBeforeWallet - walletUsed);
    const pointsEarned = Math.floor((subtotal + deliveryFee - discount) * 10);
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
        [order.id, item.id, item.id, item.name_ar, item.unitPrice || item.discount_price || item.price,
         item.quantity, item.subtotal, JSON.stringify(item.options || []), item.notes || '']
      );
    }

    // آثار ثانوية (نقاط/محفظة/كاش باك) — ملفوفة بـ try/catch حتى لا تُفشِل الطلب أبداً
    try {
      // 🏆 خصم النقاط المستبدلة
      if (pointsRedeemed > 0) {
        await pool.query('UPDATE users SET loyalty_points = GREATEST(0, loyalty_points - $1) WHERE id=$2', [pointsRedeemed, req.user.id]);
      }
      // 💳 خصم المبلغ المستخدم من المحفظة + تسجيل الحركة
      if (walletUsed > 0) {
        await pool.query('UPDATE users SET wallet_balance = GREATEST(0, wallet_balance - $1) WHERE id=$2', [walletUsed, req.user.id]);
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'debit',$2,$3)`,
          [req.user.id, walletUsed, `دفع طلب #${orderNumber}`]
        );
      }
      // 💰 كاش باك 2% للمحفظة على كل طلب
      const cashback = Math.round(subtotal * 0.02 * 100) / 100;
      if (cashback > 0) {
        await pool.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id=$2', [cashback, req.user.id]);
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'credit',$2,$3)`,
          [req.user.id, cashback, `كاش باك طلب #${orderNumber}`]
        );
      }
    } catch (fxErr) {
      console.error('post-order effects (non-fatal):', fxErr.message);
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
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get user orders
router.get('/my', auth, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);
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
    params.push(safeLimit, safeOffset);
    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
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
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
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
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Update order status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    const order = orders[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    // Role-based status permission check
    const role = req.user.role;
    const isRestaurant = role === 'restaurant' || role === 'restaurant_owner';
    const driverStatuses = ['on_the_way', 'delivered'];
    const restaurantStatuses = ['confirmed', 'preparing', 'ready', 'cancelled'];
    // طلبات الاستلام من المحل: لا يوجد سائق، فالمطعم ينهي الطلب بنفسه
    if (order.order_type === 'pickup') restaurantStatuses.push('delivered');
    if (role === 'driver' && !driverStatuses.includes(status)) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتغيير الحالة إلى هذه القيمة' });
    }
    if (isRestaurant && !restaurantStatuses.includes(status)) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتغيير الحالة إلى هذه القيمة' });
    }
    if (role !== 'admin' && role !== 'driver' && !isRestaurant) {
      return res.status(403).json({ success: false, message: 'غير مصرح' });
    }

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
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
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
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
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
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
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
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Rate order
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { restaurant_rating, driver_rating, comment, images } = req.body;
    const { rows: orders } = await pool.query(
      "SELECT * FROM orders WHERE id=$1 AND customer_id=$2 AND status='delivered'",
      [req.params.id, req.user.id]
    );
    if (!orders[0]) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const order = orders[0];

    await pool.query(
      `INSERT INTO reviews (order_id, customer_id, restaurant_id, driver_id, restaurant_rating, driver_rating, comment, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (order_id) DO NOTHING`,
      [order.id, req.user.id, order.restaurant_id, order.driver_id, restaurant_rating, driver_rating, comment, JSON.stringify(images || [])]
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
    // تحديث معدّل تقييم السائق (كان ناقص)
    if (order.driver_id) {
      await pool.query(
        `UPDATE drivers SET
          rating = COALESCE((SELECT AVG(driver_rating) FROM reviews WHERE driver_id=$1 AND driver_rating IS NOT NULL), 0)
         WHERE user_id=$1`,
        [order.driver_id]
      );
    }

    // 🔔 إشعارات التقييم للمطعم والسائق (غير قاتلة)
    const stars = (n) => '⭐'.repeat(Math.max(0, Math.min(5, parseInt(n) || 0)));
    try {
      const { rows: rst } = await pool.query('SELECT owner_id FROM restaurants WHERE id=$1', [order.restaurant_id]);
      const ownerId = rst[0]?.owner_id;
      if (ownerId && restaurant_rating) {
        const msg = `قيّمك زبون: ${stars(restaurant_rating)} (${restaurant_rating}/5)${comment ? ' — ' + comment : ''}`;
        saveNotification(ownerId, msg, 'review', { order_id: order.id, rating: restaurant_rating });
        notifyUser(req.io, ownerId, 'new_review', { order_id: order.id, rating: restaurant_rating, comment });
        try { const t = await getUserTokens(ownerId); if (t.length) await sendFCM(t, '⭐ تقييم جديد', msg, { type: 'review' }, 'com.wasaly.restaurant'); } catch {}
        sendWebPush(order.restaurant_id, '⭐ تقييم جديد', msg, { order_id: order.id }).catch(() => {});
      }
    } catch (e) { console.error('review notify (restaurant):', e.message); }
    try {
      if (order.driver_id && driver_rating) {
        const msg = `قيّمك زبون: ${stars(driver_rating)} (${driver_rating}/5)${comment ? ' — ' + comment : ''}`;
        saveNotification(order.driver_id, msg, 'review', { order_id: order.id, rating: driver_rating });
        notifyUser(req.io, order.driver_id, 'new_review', { order_id: order.id, rating: driver_rating, comment });
        try { const t = await getUserTokens(order.driver_id); if (t.length) await sendFCM(t, '⭐ تقييم جديد', msg, { type: 'review' }, 'com.wasaly.driver'); } catch {}
      }
    } catch (e) { console.error('review notify (driver):', e.message); }

    res.json({ success: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

module.exports = router;
module.exports.assignDriverToOrder = assignDriverToOrder;
