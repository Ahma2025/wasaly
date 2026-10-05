import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { fmtDateTime } from '../utils/format';
import { FiStar } from 'react-icons/fi';
import { PageHeader, Segmented, EmptyState, ListSkeleton, StatTile, LoadMore, Avatar } from '../components/ui';

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
    <div className="page">
      <PageHeader icon={<FiStar />} title="التقييمات والملاحظات" subtitle={`آخر ${reviews.length} تقييم`} />

      <div className="grid grid-cols-2 gap-3 lg:gap-4 lg:max-w-2xl">
        <StatTile label="متوسط تقييم المتاجر" value={`${avg('restaurant_rating')} ★`} tone="orange" hint={`من آخر ${reviews.length} تقييم`} />
        <StatTile label="متوسط تقييم السائقين" value={`${avg('driver_rating')} ★`} tone="violet" hint={`من آخر ${reviews.length} تقييم`} />
      </div>

      <Segmented value={filter} onChange={(v) => { setFilter(v); setVisible(PAGE); }} options={[['all', 'الكل'], ['restaurant', '🏪 المتاجر'], ['driver', '🛵 السائقين']]} />

      {loading && reviews.length === 0 ? <ListSkeleton rows={5} grid />
        : shown.length === 0 ? <EmptyState icon={<FiStar />} title="لا توجد تقييمات" hint="ستظهر تقييمات الزبائن هنا بعد تسليم الطلبات" />
        : (
          <div className="grid gap-3 lg:gap-4 sm:grid-cols-2 xl:grid-cols-3 items-start stagger">
            {shown.slice(0, visible).map(r => (
              <article key={r.id} className="card card-hover p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar name={r.customer_name} size={38} rounded={12} tint="#2E90FA" />
                  <div className="min-w-0">
                    <p className="font-bold text-ink text-sm leading-none truncate">{r.customer_name || 'زبون'}</p>
                    <p className="text-[10.5px] text-ink-3 mt-1 num">{fmtDateTime(r.created_at)}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm rounded-xl bg-surface p-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-ink-2 truncate font-medium">🏪 {r.restaurant_name || 'متجر'}</span><Stars n={parseInt(r.restaurant_rating)} /></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-ink-2 truncate font-medium">🛵 {r.driver_name || 'بدون سائق'}</span><Stars n={parseInt(r.driver_rating)} /></div>
                </div>
                {r.comment && <p className="text-[13.5px] text-ink mt-3 leading-relaxed whitespace-pre-wrap break-words relative pr-4 border-r-2 border-orange-200">{r.comment}</p>}
                {parseImgs(r.images).length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                    {parseImgs(r.images).map((src, i) => (
                      <img key={i} src={String(src)} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 ring-1 ring-surface-line" alt="" loading="lazy" />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      <LoadMore shown={Math.min(visible, shown.length)} total={shown.length} onMore={() => setVisible(v => v + PAGE)} />
    </div>
  );
}
