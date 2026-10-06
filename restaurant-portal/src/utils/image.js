// ضغط الصور على الجهاز قبل الرفع (صور الكاميرا 4-8MB كانت تفشل على النت البطيء)
// يعيد File جاهزًا للرفع: JPEG بأقصى بُعد maxPx، أو الملف الأصلي إن كان صغيرًا أصلًا أو تعذّر الضغط
export async function compressImage(file, { maxPx = 1600, quality = 0.82, skipBelow = 350 * 1024 } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;
  // GIF متحرك / SVG: نتركها كما هي
  if (/gif|svg/i.test(file.type)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
    if (ratio === 1 && file.size <= skipBelow) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; // خلفية بيضاء بدل الشفافية (JPEG)
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
    try { return new File([blob], name, { type: 'image/jpeg' }); }
    catch { blob.name = name; return blob; }
  } catch {
    return file;
  }
}

// رسالة خطأ رفع مفهومة (رسالة السيرفر إن وجدت)
export const uploadErrorMessage = (e) => (e && e.message && e.message !== 'حدث خطأ، حاول مرة أخرى' ? e.message : 'فشل رفع الصورة — حاول مرة أخرى');
