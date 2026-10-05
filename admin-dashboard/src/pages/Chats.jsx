import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { FiArrowRight, FiSend, FiPhone, FiMessageCircle, FiMessageSquare } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { fmtTime } from '../utils/format';
import { PageHeader, EmptyState, ListSkeleton, SearchInput, Avatar, Spinner, useMediaQuery } from '../components/ui';
import { Sk } from '../components/Skeleton';

/** setInterval يتوقف تلقائياً عندما يكون التطبيق/التبويب مخفياً */
function useVisiblePolling(fn, ms, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let t = null;
    const start = () => { if (!t) t = setInterval(fn, ms); };
    const stop = () => { clearInterval(t); t = null; };
    const onVis = () => { if (document.hidden) stop(); else { fn(); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [fn, ms, enabled]);
}

const ROLE_TINT = (r) => (/سائق/.test(r || '') ? '#8B5CF6' : /مطعم|متجر/.test(r || '') ? '#16A34A' : '#FF6B00');

export default function Chats() {
  const [convos, setConvos] = useState(readCache('adm_convos') || []);
  const [loading, setLoading] = useState(!readCache('adm_convos'));
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const desktop = useMediaQuery('(min-width: 1024px)');

  const loadConvos = useCallback(() => api.get('/support/chat/conversations')
    .then(r => { setConvos(r.data || []); writeCache('adm_convos', r.data || []); })
    .catch(e => { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل المحادثات', { id: 'convos' }); })
    .finally(() => setLoading(false)), []);

  useEffect(() => { loadConvos(); }, [loadConvos]);
  // في وضع اللوحتين تبقى القائمة ظاهرة فنستمر في تحديثها
  useVisiblePolling(loadConvos, 6000, !active || desktop);

  const q = search.trim().toLowerCase();
  const shown = convos.filter(c => !q || [c.name, c.phone, c.last_message].join(' ').toLowerCase().includes(q));
  const totalUnread = convos.reduce((a, c) => a + (parseInt(c.unread) || 0), 0);

  const list = loading && convos.length === 0 ? <div className="p-3"><ListSkeleton rows={6} /></div>
    : shown.length === 0 ? <div className="p-3"><EmptyState icon={<FiMessageCircle />} title="لا توجد محادثات" hint={q ? 'لا نتائج مطابقة' : 'ستظهر رسائل الدعم هنا'} compact /></div>
    : (
      <ul className={desktop ? 'divide-y divide-[#F3F4F8]' : 'space-y-2'}>
        {shown.map(c => {
          const on = active?.user_id === c.user_id;
          const unread = parseInt(c.unread) > 0;
          return (
            <li key={c.user_id}>
              <button onClick={() => setActive(c)}
                className={`w-full text-right flex items-center gap-3 relative ${desktop ? `px-4 py-3.5 ${on ? 'bg-orange-50/80' : 'hover:bg-[#FAFBFD]'}` : 'card card-hover p-3.5'}`}>
                {desktop && on && <span className="absolute right-0 top-2 bottom-2 w-[3px] rounded-l grad-sunset" />}
                <Avatar name={c.name} size={46} rounded={15} tint={ROLE_TINT(c.role_ar)} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-none truncate ${unread ? 'font-black text-ink' : 'font-bold text-ink'}`}>
                    {c.name || 'مستخدم'} {c.role_ar && <span className="text-ink-3 text-[11px] font-bold">· {c.role_ar}</span>}
                  </p>
                  <p className={`text-xs mt-1.5 truncate ${unread ? 'text-ink-2 font-bold' : 'text-ink-3'}`}>{c.last_message}</p>
                </div>
                {unread && (
                  <span className="grad-sunset text-white text-[10.5px] font-black rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center flex-shrink-0 shadow-brand num animate-pop">{c.unread}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );

  if (desktop) {
    return (
      <div className="page">
        <PageHeader icon={<FiMessageCircle />} title="المحادثات" subtitle={`دعم الزبائن والسائقين والمتاجر${totalUnread ? ` · ${totalUnread} غير مقروءة` : ''}`} />
        <div className="card overflow-hidden grid grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)] h-[calc(100vh-200px)] min-h-[520px]">
          <div className="border-l border-surface-line flex flex-col min-h-0">
            <div className="p-3 border-b border-surface-line bg-[#FAFBFD]"><SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الرسالة…" /></div>
            <div className="flex-1 overflow-y-auto">{list}</div>
          </div>
          <div className="min-h-0 flex flex-col">
            {active ? <Thread key={active.user_id} convo={active} inline onClose={() => { setActive(null); loadConvos(); }} />
              : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 dot-grid">
                  <div className="w-20 h-20 rounded-[26px] grad-sunset text-white flex items-center justify-center text-3xl shadow-brand mb-4 animate-float"><FiMessageSquare /></div>
                  <p className="font-black text-ink text-lg">اختر محادثة</p>
                  <p className="text-sm text-ink-3 mt-1">اختر محادثة من القائمة لعرض الرسائل والرد.</p>
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader icon={<FiMessageCircle />} title="المحادثات" subtitle={`دعم الزبائن والسائقين والمتاجر${totalUnread ? ` · ${totalUnread} غير مقروءة` : ''}`} />
      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الرسالة…" />
      {list}
      {active && <Thread convo={active} onClose={() => { setActive(null); loadConvos(); }} />}
    </div>
  );
}

function Thread({ convo, onClose, inline }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const loadThread = useCallback(() => api.get(`/support/chat/user/${convo.user_id}`)
    .then(r => setMessages(r.data || []))
    .catch(() => {})
    .finally(() => setLoading(false)), [convo.user_id]);

  useEffect(() => { loadThread(); }, [loadThread]);
  useVisiblePolling(loadThread, 4000);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await api.post(`/support/chat/user/${convo.user_id}`, { message: msg });
      setText(''); // نمسح النص فقط بعد نجاح الإرسال
      loadThread();
    } catch (e) { toast.error(e?.message || 'فشل الإرسال — رسالتك ما زالت في الخانة'); }
    finally { setSending(false); }
  };

  const body = (
    <>
      <div className={`bg-white/95 backdrop-blur border-b border-surface-line px-3 sm:px-4 pb-3 flex items-center gap-3 ${inline ? 'pt-3' : 'shadow-soft'}`}
        style={inline ? undefined : { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        {!inline && <button onClick={onClose} aria-label="رجوع" className="w-10 h-10 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center text-lg"><FiArrowRight /></button>}
        <Avatar name={convo.name} size={42} rounded={14} tint={ROLE_TINT(convo.role_ar)} />
        <div className="flex-1 min-w-0">
          <p className="font-black text-ink leading-none truncate">{convo.name || 'مستخدم'} {convo.role_ar && <span className="text-ink-3 text-xs font-bold">· {convo.role_ar}</span>}</p>
          {convo.phone && <p className="text-[11px] text-ink-3 mt-1 num" dir="ltr" style={{ textAlign: 'right' }}>{convo.phone}</p>}
        </div>
        {convo.phone && <a href={`tel:${convo.phone}`} aria-label="اتصال" title="اتصال" className="w-10 h-10 rounded-full bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center"><FiPhone /></a>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2 w-full bg-[#F7F8FB] dot-grid">
        <div className="max-w-3xl mx-auto space-y-2">
          {loading && messages.length === 0 ? (
            <div className="space-y-3 py-4">{[60, 40, 70].map((w, i) => <Sk key={i} w={`${w}%`} h={44} r={18} className={i % 2 ? 'mr-auto' : ''} />)}</div>
          ) : messages.length === 0 ? <div className="text-center py-12 animate-fade-up">
              <div className="w-14 h-14 mx-auto mb-3 rounded-[18px] bg-white ring-1 ring-orange-100 flex items-center justify-center text-2xl text-brand-500 shadow-soft"><FiMessageCircle /></div>
              <p className="text-sm font-black text-ink">لا توجد رسائل بعد</p>
              <p className="text-[12px] text-ink-3 font-medium mt-1">اكتب رسالتك بالأسفل لبدء المحادثة</p>
            </div>
            : messages.map(m => {
              const mine = m.sender === 'admin';
              return (
                <div key={m.id} className={`max-w-[80%] w-fit px-3.5 py-2.5 rounded-[18px] text-sm whitespace-pre-wrap break-words animate-fade-up leading-relaxed ${mine ? 'grad-sunset text-white mr-auto rounded-bl-md shadow-[0_6px_16px_rgba(245,59,87,.22)]' : 'bg-white text-ink ml-auto rounded-br-md border border-surface-line shadow-soft'}`}>
                  {m.message}
                  {m.created_at && <span className={`block text-[9.5px] mt-1 num ${mine ? 'text-white/75 text-left' : 'text-ink-3'}`}>{fmtTime(m.created_at)}</span>}
                </div>
              );
            })}
          <div ref={endRef} />
        </div>
      </div>

      <div className="bg-white border-t border-surface-line px-3 pt-2.5" style={{ paddingBottom: inline ? 10 : 'calc(env(safe-area-inset-bottom) + 10px)' }}>
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea rows={1} className="inp flex-1 resize-none max-h-32 !rounded-[20px]" placeholder="اكتب ردّك… (Enter للإرسال)" aria-label="نص الرد" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button onClick={send} disabled={!text.trim() || sending} aria-label="إرسال"
            className="w-[46px] h-[46px] rounded-full grad-sunset text-white flex-shrink-0 flex items-center justify-center shadow-brand disabled:opacity-40 disabled:shadow-none">
            {sending ? <Spinner light /> : <FiSend className="-scale-x-100" />}
          </button>
        </div>
      </div>
    </>
  );

  if (inline) return <div className="flex flex-col h-full min-h-0 animate-fade-in">{body}</div>;

  // شاشة كاملة فوق شريط التنقل مع احترام المناطق الآمنة
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-surface" style={{ animation: 'drawerIn .32s cubic-bezier(.2,.9,.25,1.02) both' }} dir="rtl">
      {body}
    </div>,
    document.body
  );
}
