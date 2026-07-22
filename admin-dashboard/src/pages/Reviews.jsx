import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const Stars = ({ n }) => n ? (
  <span className="text-yellow-400 text-sm whitespace-nowrap">{'★'.repeat(n)}<span className="text-gray-300">{'★'.repeat(5 - n)}</span></span>
) : <span className="text-gray-300 text-xs">—</span>;

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | restaurant | driver

  useEffect(() => {
    api.get('/reviews/all')
      .then(r => setReviews(r.data || []))
      .catch(() => toast.error('فشل تحميل التقييمات'))
      .finally(() => setLoading(false));
  }, []);

  const parseImgs = (imgs) => { try { return typeof imgs === 'string' ? JSON.parse(imgs) : (imgs || []); } catch { return []; } };

  const shown = reviews.filter(r =>
    filter === 'all' ? true : filter === 'restaurant' ? r.restaurant_rating : r.driver_rating
  );

  const avg = (key) => {
    const vals = reviews.map(r => parseInt(r[key])).filter(Boolean);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '0.0';
  };

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">التقييمات والملاحظات ⭐</h1>

      {/* ملخص */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white shadow-card">
          <p className="text-white/80 text-xs">متوسط تقييم المطاعم</p>
          <p className="text-3xl font-black mt-1">{avg('restaurant_rating')} ★</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-card">
          <p className="text-white/80 text-xs">متوسط تقييم السائقين</p>
          <p className="text-3xl font-black mt-1">{avg('driver_rating')} ★</p>
        </div>
      </div>

      {/* فلتر */}
      <div className="flex gap-2">
        {[{ k: 'all', l: 'الكل' }, { k: 'restaurant', l: 'المطاعم 🏪' }, { k: 'driver', l: 'السائقين 🛵' }].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${filter === f.k ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><p className="text-5xl mb-3">⭐</p><p className="font-semibold">لا توجد تقييمات</p></div>
      ) : (
        <div className="space-y-3">
          {shown.map(r => (
            <div key={r.id} className="bg-white rounded-2xl p-4 shadow-soft border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-black text-gray-600">
                    {r.customer_name?.[0] || '؟'}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm leading-none">{r.customer_name || 'زبون'}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleString('ar')}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">🏪 {r.restaurant_name || 'مطعم'}</span>
                  <Stars n={parseInt(r.restaurant_rating)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">🛵 {r.driver_name || 'بدون سائق'}</span>
                  <Stars n={parseInt(r.driver_rating)} />
                </div>
              </div>
              {r.comment && <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-xl p-2">💬 {r.comment}</p>}
              {parseImgs(r.images).length > 0 && (
                <div className="flex gap-2 mt-2 overflow-x-auto">
                  {parseImgs(r.images).map((src, i) => (
                    <img key={i} src={src} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt="" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
