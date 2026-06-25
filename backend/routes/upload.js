const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Images only'));
  }
});

router.post('/', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
  const url = `${process.env.API_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

router.post('/multiple', auth, upload.array('files', 5), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files' });
  const urls = req.files.map(f => `${process.env.API_URL || 'http://localhost:5000'}/uploads/${f.filename}`);
  res.json({ success: true, urls });
});

module.exports = router;
