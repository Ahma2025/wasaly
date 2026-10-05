const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const { auth } = require('../middleware/auth');
const { uploadJpeg } = require('../utils/storage');
const { serverError } = require('../utils/http');

const NOT_IMAGE = 'الملف ليس صورة (المسموح: JPG / PNG / WEBP / HEIC / GIF)';
class UnsupportedType extends Error { constructor() { super(NOT_IMAGE); this.status = 415; } }

// نحفظ في الذاكرة (مش على القرص) — لأن قرص Railway مؤقّت ويُمسح عند إعادة النشر
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // SVG مرفوض (ليس صورة نقطية وقد يحمل محتوى نشطاً)
    if (/^image\//.test(file.mimetype) && !/svg/i.test(file.mimetype)) cb(null, true);
    else cb(new UnsupportedType());
  }
});

// نضغط الصورة ثم نخزّنها خارجيًا (R2/S3) لو مفعّل، وإلا Base64 داخل القاعدة (fallback آمن)
async function toDataUri(buffer) {
  let meta;
  try { meta = await sharp(buffer).metadata(); } catch { throw new UnsupportedType(); } // محتوى ليس صورة قابلة للفك
  if (!meta || !meta.format || meta.format === 'svg') throw new UnsupportedType();
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
  return uploadJpeg(out);
}

// أخطاء multer/النوع → 415 / 413 / 400 بدل 500
const withUpload = (mw) => (req, res, next) => mw(req, res, (err) => {
  if (!err) return next();
  if (err instanceof UnsupportedType) return res.status(415).json({ success: false, message: NOT_IMAGE });
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'حجم الصورة كبير جداً (الحد 15MB)' });
    return res.status(400).json({ success: false, message: 'رفع غير صالح' });
  }
  return next(err);
});
const handleErr = (res, e) => (e instanceof UnsupportedType
  ? res.status(415).json({ success: false, message: NOT_IMAGE })
  : serverError(res, e, 'upload'));

router.post('/', auth, withUpload(upload.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    const url = await toDataUri(req.file.buffer);
    res.json({ success: true, url });
  } catch (e) { handleErr(res, e); }
});

router.post('/multiple', auth, withUpload(upload.array('files', 5)), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files' });
    const urls = [];
    for (const f of req.files) urls.push(await toDataUri(f.buffer));
    res.json({ success: true, urls });
  } catch (e) { handleErr(res, e); }
});

module.exports = router;
