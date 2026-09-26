// ═══════════════════════════════════════════════════════════════
//  تخزين الصور — خارجي (Cloudflare R2 / AWS S3) لو مضبوط، وإلا Base64 (الوضع الحالي)
//  يفعّل تلقائيًا عند ضبط متغيّرات البيئة:
//    S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL, (S3_REGION اختياري)
//  الفائدة: يقلّص حجم قاعدة البيانات واستهلاك الإنترنت بشكل جذري، ويسرّع كل الشاشات عبر CDN.
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');

const CFG = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  publicUrl: process.env.S3_PUBLIC_URL,
  region: process.env.S3_REGION || 'auto',
};
const ENABLED = !!(CFG.endpoint && CFG.bucket && CFG.accessKey && CFG.secretKey && CFG.publicUrl);

let _s3 = null;
function getClient() {
  if (_s3) return _s3;
  const { S3Client } = require('@aws-sdk/client-s3');
  _s3 = new S3Client({
    region: CFG.region,
    endpoint: CFG.endpoint,
    credentials: { accessKeyId: CFG.accessKey, secretAccessKey: CFG.secretKey },
    forcePathStyle: true,
  });
  return _s3;
}

// يرفع صورة JPEG مضغوطة ويرجّع رابطها العام (CDN). لو التخزين غير مفعّل → يرجّع data URI (Base64).
async function uploadJpeg(buffer) {
  if (!ENABLED) {
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `img/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  await getClient().send(new PutObjectCommand({
    Bucket: CFG.bucket, Key: key, Body: buffer,
    ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${CFG.publicUrl.replace(/\/$/, '')}/${key}`;
}

module.exports = { isStorageEnabled: ENABLED, uploadJpeg };
