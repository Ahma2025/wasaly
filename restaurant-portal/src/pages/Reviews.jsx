import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiStar, FiMessageSquare } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useRestaurant } from '../context/RestaurantContext';
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from '../components/ui';
import { formatDateTime } from '../utils/format';

const clampRating = (v) => {
  const n = Math.round(parseFloat(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : null;
};

function Stars({ n, size = 14 }) {
  const v = clampRating(n) ?? 0;
  return (
    <span className="inline-flex gap-0.5" aria-label={`${v} من 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <FiStar key={i} size={size} className={i <= v ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} aria-hidden />
      ))}
    </span>
  );
}

export default function Reviews() {
  const { restaurant } = useRestaurant();
  const cacheKey = 'rest_reviews_' + restaurant.id;
  const cachedRev = readCache(cacheKey);
  const [reviews, setReviews] = useState(cachedRev || []);
  const [loading, setLoading] = useState(!cachedRev);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState(0);

  const load = useCallback(async () => {
    if (!restaurant.id) { setLoading(false); return; }
    try {
      const r = await api.get(`/reviews/restaurant/${restaurant.id}`);
      setReviews(r.data || []); writeCache(cacheKey, r.data || []); setError(false);
    } catch (e) {
      if (!readCache(cacheKey)) setError(true); else toast.error(e.message || 'فشل تحميل التقييمات');
    } finally { setLoading(false); setRefreshing(false); }
  }, [restaurant.id, cacheKey]);

  useEffect(() => { load(); }, [load]);

  // المتوسط من التقييمات التي فيها تقييم للمطعم فقط (الفارغة لا تُحسب صفرًا)
  const { avg, rated, dist } = useMemo(() => {
    const vals = reviews.map(r => clampRating(r.restaurant_rating)).filter(v => v != null && v > 0);
    const dist = [5, 4, 3, 2, 1].map(s => ({ s, c: vals.filter(v => v === s).length }));
    return {
      avg: vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : parseFloat(restaurant.rating || 0),
      rated: vals.length,
      dist,
    };
  }, [reviews, restaurant.rating]);

  const parseImgs = (imgs) => { try { const v = typeof imgs === 'string' ? JSON.parse(imgs) : (imgs || []); return Array.isArray(v) ? v : []; } catch { return []; } };
  const shown = filter ? reviews.filter(r => clampRating(r.restaurant_rating) === filter) : reviews;

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <PageHeader title="التقييمات" icon={FiStar} subtitle="آراء زبائنك بعد كل طلب" onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing} />

      <div className="grad-sunset rounded-3xl p-5 text-white shadow-brand relative overflow-hidden sheen">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-xl" />
        <div className="flex items-center gap-5 relative">
          <div className="text-center">
            <p className="text-5xl font-black leading-none">{(avg || 0).toFixed(1)}</p>
            <div className="mt-2"><Stars n={avg} size={13} /></div>
            <p className="text-white/80 text-xs mt-1">{rated} تقييم</p>
          </div>
          <div className="flex-1 space-y-1">
            {dist.map(({ s, c }) => (
              <div key={s} className="flex items-center gap-2 text-[11px] font-bold">
                <span className="w-3">{s}</span>
                <div className="flex-1 h-1.5 bg-white/25 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ width: `${rated ? (c / rated) * 100 : 0}%` }} />
                </div>
                <span className="w-5 text-left text-white/80">{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {[0, 5, 4, 3, 2, 1].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 ${filter === s ? 'grad-brand text-white shadow-brand' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {s === 0 ? 'الكل' : <>{s} <FiStar size={12} className={filter === s ? 'fill-white' : 'fill-amber-400 text-amber-400'} /></>}
            </button>
          ))}
        </div>
      )}

      {loading ? <ListSkeleton rows={4} />
        : error ? <ErrorState text="تعذّر تحميل التقييمات" onRetry={load} />
        : shown.length === 0 ? (
          <EmptyState icon={FiMessageSquare} title={filter ? 'لا تقييمات بهذا العدد من النجوم' : 'لا توجد تقييمات بعد'} text={filter ? undefined : 'ستظهر تقييمات الزبائن هنا بعد طلباتهم'} />
        ) : (
          <div className="space-y-3 stagger">
            {shown.map(r => (
              <article key={r.id} className="card p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-sm font-black text-brand-600 flex-shrink-0">
                      {r.customer_name?.[0] || '؟'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm leading-tight truncate">{r.customer_name || 'زبون'}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(r.created_at)}</p>
                    </div>
                  </div>
                  {clampRating(r.restaurant_rating) ? <Stars n={r.restaurant_rating} /> : <span className="text-[11px] text-gray-400">بدون تقييم للمطعم</span>}
                </div>
                {r.comment && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{r.comment}</p>}
                {parseImgs(r.images).length > 0 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                    {parseImgs(r.images).map((src, i) => (
                      <img key={i} src={src} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt="" loading="lazy" />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
    </div>
  );
}
