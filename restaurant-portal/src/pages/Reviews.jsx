import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiStar, FiMessageSquare, FiThumbsUp } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useRestaurant } from '../context/RestaurantContext';
import { PageHeader, EmptyState, ErrorState, ListSkeleton, CountUp, cx } from '../components/ui';
import { formatDateTime } from '../utils/format';
import { pl } from '../utils/plural';

const clampRating = (v) => {
  const n = Math.round(parseFloat(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : null;
};

function Stars({ n, size = 14, light = false }) {
  const v = clampRating(n) ?? 0;
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${v} من 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <FiStar key={i} size={size} aria-hidden
          className={i <= v ? (light ? 'text-white fill-white' : 'text-amber-400 fill-amber-400') : (light ? 'text-white/35 fill-white/20' : 'text-gray-200 fill-gray-200')} />
      ))}
    </span>
  );
}

const AVATAR_GRADS = [
  'from-brand-400 to-coral', 'from-sky-400 to-indigo-500', 'from-emerald-400 to-teal-500',
  'from-violet-400 to-fuchsia-500', 'from-amber-400 to-orange-500',
];
const gradFor = (name = '') => AVATAR_GRADS[[...String(name)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_GRADS.length];

export default function Reviews() {
  const { restaurant } = useRestaurant();
  const cacheKey = 'rest_reviews_' + restaurant.id;
  const [reviews, setReviews] = useState(() => readCache(cacheKey) || []);
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
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

  // العنوان الرئيسي = التقييم الرسمي للمطعم (كل التقييمات، كما يراه الزبائن) — السيرفر يرسل آخر 100 تقييم فقط،
  // لذلك التوزيع والنسبة الإيجابية محسوبان من «آخر N تقييم» ومكتوب ذلك بوضوح
  const { avg, total, sample, dist, positive } = useMemo(() => {
    const vals = reviews.map(r => clampRating(r.restaurant_rating)).filter(v => v != null && v > 0);
    const dist = [5, 4, 3, 2, 1].map(s => ({ s, c: vals.filter(v => v === s).length }));
    const official = parseFloat(restaurant.rating);
    const officialCount = parseInt(restaurant.total_reviews);
    const sampleAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return {
      avg: Number.isFinite(official) && official > 0 ? official : sampleAvg,
      total: Number.isFinite(officialCount) && officialCount >= vals.length ? officialCount : vals.length,
      sample: vals.length,
      dist,
      positive: vals.length ? Math.round(vals.filter(v => v >= 4).length / vals.length * 100) : null,
    };
  }, [reviews, restaurant.rating, restaurant.total_reviews]);
  const partial = total > sample;

  const parseImgs = (imgs) => { try { const v = typeof imgs === 'string' ? JSON.parse(imgs) : (imgs || []); return Array.isArray(v) ? v : []; } catch { return []; } };
  const shown = filter ? reviews.filter(r => clampRating(r.restaurant_rating) === filter) : reviews;
  const maxC = Math.max(1, ...dist.map(x => x.c));

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader title="التقييمات" icon={FiStar} subtitle="آراء زبائنك بعد كل طلب" onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing} />

      <div className="grid gap-4 lg:grid-cols-12 items-start">
        {/* ─── ملخص التقييم ─── */}
        <aside className="min-w-0 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24 space-y-3">
          <section className="grad-mesh rounded-[24px] p-5 text-white shadow-brand sheen animate-pop">
            <div className="relative z-[1] flex items-center gap-4">
              <div className="text-center">
                <p className="text-[52px] font-black leading-none tnum"><CountUp value={avg || 0} decimals={1} /></p>
                <div className="mt-2"><Stars n={avg} size={14} light /></div>
                <p className="text-white/85 text-[12px] font-bold mt-1.5 tnum">{total ? pl(total, 'review') : 'لا تقييمات'}</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {partial && <p className="text-[10.5px] text-white/80 font-bold">التوزيع: آخر {pl(sample, 'reviewGen')}</p>}
                {dist.map(({ s, c }, i) => (
                  <button key={s} onClick={() => setFilter(filter === s ? 0 : s)} aria-pressed={filter === s}
                    className={cx('no-press w-full flex items-center gap-2 text-[11.5px] font-bold rounded-lg px-1 py-0.5 hover:bg-white/10', filter === s && 'bg-white/15')}>
                    <span className="w-3 tnum">{s}</span>
                    <FiStar size={10} className="fill-white flex-shrink-0" aria-hidden />
                    <span className="flex-1 h-2 bg-white/25 rounded-full overflow-hidden">
                      <span className="block h-full bg-white rounded-full grow-x" style={{ width: `${sample ? (c / maxC) * 100 : 0}%`, animationDelay: `${i * 70}ms` }} />
                    </span>
                    <span className="w-6 text-left text-white/85 tnum">{c}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          {positive != null && (
            <div className="card p-4 flex items-center gap-3">
              <span className="w-11 h-11 rounded-[14px] bg-success-soft text-success flex items-center justify-center"><FiThumbsUp size={19} aria-hidden /></span>
              <div>
                <p className="text-xl font-extrabold text-ink leading-none tnum"><CountUp value={positive} />%</p>
                <p className="text-[12px] font-bold text-ink-3 mt-1">{partial ? `من آخر ${pl(sample, 'reviewGen')}: 4 نجوم أو أكثر` : 'من التقييمات 4 نجوم أو أكثر'}</p>
              </div>
            </div>
          )}
        </aside>

        {/* ─── القائمة ─── */}
        <div className="min-w-0 lg:col-span-7 xl:col-span-8 space-y-3">
          {reviews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="تصفية حسب النجوم">
              {[0, 5, 4, 3, 2, 1].map(s => (
                <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s}
                  className={cx('flex-shrink-0 h-10 px-4 rounded-full text-[13px] font-bold flex items-center gap-1.5 border-[1.5px]',
                    filter === s ? 'grad-brand text-white border-transparent shadow-brand' : 'bg-white text-ink-2 border-surface-line hover:border-brand-200')}>
                  {s === 0 ? 'الكل' : <><span className="tnum">{s}</span> <FiStar size={12} className={filter === s ? 'fill-white' : 'fill-amber-400 text-amber-400'} aria-hidden /></>}
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
                {shown.map(r => {
                  const rating = clampRating(r.restaurant_rating);
                  const imgs = parseImgs(r.images);
                  return (
                    <article key={r.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cx('w-11 h-11 rounded-full bg-gradient-to-br text-white flex items-center justify-center text-[15px] font-black flex-shrink-0 shadow-soft', gradFor(r.customer_name))}>
                            {r.customer_name?.[0] || '؟'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-extrabold text-ink text-[14.5px] leading-tight truncate">{r.customer_name || 'زبون'}</p>
                            <p className="text-[11.5px] text-ink-3 mt-1">{formatDateTime(r.created_at)}</p>
                          </div>
                        </div>
                        {rating ? (
                          <span className={cx('flex flex-col items-end gap-1 flex-shrink-0')}>
                            <Stars n={rating} size={13} />
                            <span className={cx('chip tnum', rating >= 4 ? 'bg-success-soft text-emerald-700' : rating === 3 ? 'bg-warning-soft text-amber-700' : 'bg-danger-soft text-danger')}>{rating}.0</span>
                          </span>
                        ) : <span className="text-[11px] text-ink-3 font-bold">بدون تقييم للمطعم</span>}
                      </div>
                      {r.comment && <p className="text-[14px] text-ink-2 mt-3 leading-relaxed bg-surface/70 rounded-[14px] px-3.5 py-2.5">{r.comment}</p>}
                      {imgs.length > 0 && (
                        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                          {imgs.map((src, i) => (
                            <img key={i} src={src} className="w-20 h-20 rounded-[14px] object-cover flex-shrink-0 bg-surface" alt={`صورة من الزبون ${i + 1}`} loading="lazy" width="80" height="80" />
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
