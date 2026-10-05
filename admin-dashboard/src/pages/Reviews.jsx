import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { fmtDateTime } from '../utils/format';
import { PageHeader, Chips, EmptyState, ListSkeleton, StatTile, LoadMore } from '../components/ui';

const PAGE = 30;
const Stars = ({ n }) => n ? (
  <span className="text-yellow-400 text-sm whitespace-nowrap" aria-label={`${n} من 5`}>{'★'.repeat(n)}<span className="text-gray-200">{'★'.repeat(Math.max(0, 5 - n))}</span></span>
) : <span className="text-gray-300 text-xs">—</span>;

const parseImgs = (imgs) => { try { const v = typeof imgs === 'string' ? JSON.parse(imgs) : imgs; return Array.isArray(v) ? v : []; } catch { return []; } };

export default function Reviews() {
  const cached = readCache('adm_reviews');
  const [reviews, setReviews] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [filter, setFilter] = useState('all');
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    api.get('/reviews/all')
      .then(r => { setReviews(r.data || []); writeCache('adm_reviews', r.data || []); })
      .catch(e => { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل التقييمات'); })
      .finally(() => setLoading(false));
  }, []);

  const shown = reviews.filter(r => (filter === 'all' ? true : filter === 'restaurant' ? r.restaurant_rating : r.driver_rating));
  const avg = (key) => {
    const vals = reviews.map(r => parseInt(r[key])).filter(Boolean);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '0.0';
  };

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="⭐" title="التقييمات والملاحظات" subtitle={`آخر ${reviews.length} تقييم`} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="متوسط تقييم المتاجر" value={`${avg('restaurant_rating')} ★`} tone="orange" />
        <StatTile label="متوسط تقييم السائقين" value={`${avg('driver_rating')} ★`} tone="violet" />
      </div>
      <p className="text-[10px] text-gray-400 -mt-2">المتوسط محسوب من آخر {reviews.length} تقييم محمّل.</p>

      <Chips value={filter} onChange={(v) => { setFilter(v); setVisible(PAGE); }} options={[['all', 'الكل'], ['restaurant', '🏪 المتاجر'], ['driver', '🛵 السائقين']]} />

      {loading && reviews.length === 0 ? <ListSkeleton rows={5} />
        : shown.length === 0 ? <EmptyState icon="⭐" title="لا توجد تقييمات" />
        : (
          <div className="space-y-3">
            {shown.slice(0, visible).map(r => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-sm font-black text-gray-600">{r.customer_name?.[0] || '؟'}</div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm leading-none">{r.customer_name || 'زبون'}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{fmtDateTime(r.created_at)}</p>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between"><span className="text-gray-500 truncate">🏪 {r.restaurant_name || 'متجر'}</span><Stars n={parseInt(r.restaurant_rating)} /></div>
                  <div className="flex items-center justify-between"><span className="text-gray-500 truncate">🛵 {r.driver_name || 'بدون سائق'}</span><Stars n={parseInt(r.driver_rating)} /></div>
                </div>
                {r.comment && <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-xl p-2.5 whitespace-pre-wrap break-words">💬 {r.comment}</p>}
                {parseImgs(r.images).length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                    {parseImgs(r.images).map((src, i) => (
                      <img key={i} src={String(src)} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt="" loading="lazy" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      <LoadMore shown={Math.min(visible, shown.length)} total={shown.length} onMore={() => setVisible(v => v + PAGE)} />
    </div>
  );
}
