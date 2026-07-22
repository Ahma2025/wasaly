const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const { auth } = require('../middleware/auth');

// نحفظ في الذاكرة (مش على القرص) — لأن قرص Railway مؤقّت ويُمسح عند إعادة النشر
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// نضغط الصورة ونحوّلها base64 لتُخزَّن داخل قاعدة البيانات — تبقى دائماً بعد إعادة النشر
async function toDataUri(buffer) {
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    const url = await toDataUri(req.file.buffer);
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/multiple', auth, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files' });
    const urls = [];
    for (const f of req.files) urls.push(await toDataUri(f.buffer));
    res.json({ success: true, urls });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
