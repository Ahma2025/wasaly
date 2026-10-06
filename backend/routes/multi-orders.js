// ═══════════════════════════════════════════════════════════════
//  🧺 مسارات الطلب المجمّع (عدة مطاعم — سائق واحد) — تُركَّب داخل /api/orders
//  ملاحظة: يختلف عن /api/group-orders (السلة المشتركة لعدة أشخاص من مطعم واحد)
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const pool = require('../config/database');
const { auth, driverOnly } = require('../middleware/auth');
const G = require('../utils/groupService');
const { HttpError, isIntId } = require('../utils/orderService');
const { serverError, clampInt, strParam } = require('../utils/http');

const sendError = (res, e, tag) => {
  if (e instanceof HttpError) return res.status(e.status).json({ success: false, message: e.message, ...e.extra });
  return serverError(res, e, tag);
};
const gid = (req) => {
  if (!isIntId(req.params.id)) throw new HttpError(404, 'الطلب غير موجود');
  return parseInt(req.params.id);
};

// إعدادات عامة (بدون تسجيل دخول) — لعرض/إخفاء ميزة "اطلب من أكثر من مطعم" بالتطبيق
router.get('/multi/config', async (req, res) => {
  try { res.json({ success: true, data: G.publicConfig(await G.getMultiConfig()) }); }
  catch (e) { sendError(res, e, 'multi config'); }
});

// عرض سعر — لا يرمي أخطاء العمل بل يرجّعها في data.errors (valid=false)
router.post('/multi/quote', auth, async (req, res) => {
  try {
    const p = await G.priceGroup(pool, req.user.id, req.body || {});
    res.json({ success: true, data: G.groupQuoteView(p) });
  } catch (e) { sendError(res, e, 'multi quote'); }
});

// إنشاء طلب مجمّع
router.post('/multi', auth, async (req, res) => {
  try {
    const { group } = await G.createGroup(req.io, req.user.id, req.body || {});
    const view = await G.loadGroupView(group.id, req.user);
    res.status(201).json({ success: true, data: { ...view, coupon_error: group.coupon_error || undefined } });
  } catch (e) { sendError(res, e, 'POST /orders/multi'); }
});

// طلباتي المجمّعة (?status=active|past)
router.get('/groups/my', auth, async (req, res) => {
  try {
    const status = strParam(req.query.status);
    const data = await G.listMyGroups(req.user.id, {
      status, limit: clampInt(req.query.limit, 20, 1, 100), offset: clampInt(req.query.offset, 0, 0, 1000000),
    });
    res.json({ success: true, data });
  } catch (e) { sendError(res, e, 'GET /orders/groups/my'); }
});

router.get('/groups/:id', auth, async (req, res) => {
  try { res.json({ success: true, data: await G.loadGroupView(gid(req), req.user) }); }
  catch (e) { sendError(res, e, 'GET /orders/groups/:id'); }
});

// الزبون يلغي المجموعة كاملة (أو الإدارة)
router.patch('/groups/:id/cancel', auth, async (req, res) => {
  try {
    const r = await G.cancelGroup(req.io, gid(req), req.user, (req.body || {}).reason);
    res.json({ success: true, data: r });
  } catch (e) { sendError(res, e, 'group cancel'); }
});

// ─── السائق ───
router.post('/groups/:id/accept', auth, driverOnly, async (req, res) => {
  try { res.json({ success: true, data: await G.acceptGroup(req.io, gid(req), req.user.id) }); }
  catch (e) { sendError(res, e, 'group accept'); }
});
router.post('/groups/:id/reject', auth, driverOnly, async (req, res) => {
  try { await G.rejectGroup(req.io, gid(req), req.user.id); res.json({ success: true }); }
  catch (e) { sendError(res, e, 'group reject'); }
});
router.post('/groups/:id/pickup', auth, driverOnly, async (req, res) => {
  try { res.json({ success: true, data: await G.pickupChild(req.io, gid(req), req.user.id, (req.body || {}).order_id) }); }
  catch (e) { sendError(res, e, 'group pickup'); }
});
router.post('/groups/:id/deliver', auth, driverOnly, async (req, res) => {
  try { res.json({ success: true, data: await G.deliverGroup(req.io, gid(req), req.user.id) }); }
  catch (e) { sendError(res, e, 'group deliver'); }
});

module.exports = router;
