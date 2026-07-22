import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const Stars = ({ n }) => (
  <span className="text-yellow-400 text-sm">{'★'.repeat(n || 0)}<span className="text-gray-300">{'★'.repeat(5 - (n || 0))}</span></span>
);

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => {
    if (!restaurant.id) return setLoading(false);
    api.get(`/reviews/restaurant/${restaurant.id}`)
      .then(r => setReviews(r.data || []))
      .catch(() => toast.error('فشل تحميل التقييمات'))
      .finally(() => setLoading(false));
  }, []);

  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + (parseInt(r.restaurant_rating) || 0), 0) / reviews.length).toFixed(1)
    : parseFloat(restaurant.rating || 0).toFixed(1);

  const parseImgs = (imgs) => { try { return typeof imgs === 'string' ? JSON.parse(imgs) : (imgs || []); } catch { return []; } };

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">التقييمات ⭐</h1>

      {/* ملخص */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-3xl p-5 text-white shadow-brand flex items-center justify-between">
        <div>
          <p className="text-white/80 text-xs font-semibold mb-1">متوسط تقييم المطعم</p>
          <p className="text-4xl font-black">{avg} <span className="text-2xl">★</span></p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black">{reviews.length}</p>
          <p className="text-white/80 text-xs">تقييم</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">⭐</p>
          <p className="font-semibold">لا توجد تقييمات بعد</p>
          <p className="text-sm mt-1">ستظهر تقييمات الزبائن هنا</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="bg-white rounded-2xl p-4 shadow-soft border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-sm font-black text-orange-600">
                    {r.customer_name?.[0] || '؟'}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm leading-none">{r.customer_name || 'زبون'}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleDateString('ar')}</p>
                  </div>
                </div>
                <Stars n={parseInt(r.restaurant_rating)} />
              </div>
              {r.comment && <p className="text-sm text-gray-600 mt-2">{r.comment}</p>}
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
