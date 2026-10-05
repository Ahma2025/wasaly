import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { FiArrowRight, FiSend, FiPhone } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { fmtTime } from '../utils/format';
import { PageHeader, EmptyState, ListSkeleton, SearchInput } from '../components/ui';

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

export default function Chats() {
  const [convos, setConvos] = useState(readCache('adm_convos') || []);
  const [loading, setLoading] = useState(!readCache('adm_convos'));
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');

  const loadConvos = useCallback(() => api.get('/support/chat/conversations')
    .then(r => { setConvos(r.data || []); writeCache('adm_convos', r.data || []); })
    .catch(e => { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل المحادثات', { id: 'convos' }); })
    .finally(() => setLoading(false)), []);

  useEffect(() => { loadConvos(); }, [loadConvos]);
  useVisiblePolling(loadConvos, 6000, !active);

  const q = search.trim().toLowerCase();
  const shown = convos.filter(c => !q || [c.name, c.phone, c.last_message].join(' ').toLowerCase().includes(q));

  return (
    <div className="p-4 space-y-3 animate-fade-up">
      <PageHeader icon="💬" title="المحادثات" subtitle="دعم الزبائن والسائقين والمتاجر" />
      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الرسالة…" />
      {loading && convos.length === 0 ? <ListSkeleton rows={6} />
        : shown.length === 0 ? <EmptyState icon="💬" title="لا توجد محادثات" />
        : shown.map(c => (
          <button key={c.user_id} onClick={() => setActive(c)}
            className="w-full text-right card p-4 flex items-center gap-3 hover-lift">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 flex items-center justify-center text-lg font-black text-orange-600 flex-shrink-0">
              {c.name?.[0] || '؟'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm leading-none truncate">
                {c.name || 'مستخدم'} {c.role_ar && <span className="text-orange-500 text-xs">({c.role_ar})</span>}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 truncate">{c.last_message}</p>
            </div>
            {parseInt(c.unread) > 0 && (
              <span className="grad-sunset text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center flex-shrink-0">{c.unread}</span>
            )}
          </button>
        ))}

      {active && <Thread convo={active} onClose={() => { setActive(null); loadConvos(); }} />}
    </div>
  );
}

function Thread({ convo, onClose }) {
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
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

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

  // شاشة كاملة فوق شريط التنقل مع احترام المناطق الآمنة
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#F5F6F8] animate-[fadeIn_.15s_ease]" dir="rtl">
      <div className="bg-white border-b border-gray-100 px-3 pb-3 flex items-center gap-3 shadow-soft"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <button onClick={onClose} aria-label="رجوع" className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-lg"><FiArrowRight /></button>
        <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center font-black text-orange-600">{convo.name?.[0] || '؟'}</div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 leading-none truncate">{convo.name || 'مستخدم'} {convo.role_ar && <span className="text-orange-500 text-xs">({convo.role_ar})</span>}</p>
          {convo.phone && <p className="text-[11px] text-gray-400 mt-1" dir="ltr" style={{ textAlign: 'right' }}>{convo.phone}</p>}
        </div>
        {convo.phone && <a href={`tel:${convo.phone}`} aria-label="اتصال" className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center"><FiPhone /></a>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-w-3xl w-full mx-auto">
        {loading && messages.length === 0 ? <p className="text-center text-xs text-gray-400 py-8">جاري التحميل…</p>
          : messages.length === 0 ? <p className="text-center text-xs text-gray-400 py-8">لا توجد رسائل بعد</p>
          : messages.map(m => {
            const mine = m.sender === 'admin';
            return (
              <div key={m.id} className={`max-w-[80%] w-fit px-3.5 py-2 rounded-2xl text-sm shadow-sm whitespace-pre-wrap break-words ${mine ? 'grad-brand text-white mr-auto rounded-bl-md' : 'bg-white text-gray-800 ml-auto rounded-br-md border border-gray-100'}`}>
                {m.message}
                {m.created_at && <span className={`block text-[9px] mt-0.5 ${mine ? 'text-white/70' : 'text-gray-400'}`}>{fmtTime(m.created_at)}</span>}
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      <div className="bg-white border-t border-gray-100 px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea rows={1} className="inp flex-1 resize-none max-h-32" placeholder="اكتب ردّك…" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button onClick={send} disabled={!text.trim() || sending} aria-label="إرسال"
            className="w-11 h-11 rounded-2xl grad-sunset text-white flex-shrink-0 flex items-center justify-center shadow-brand disabled:opacity-50">
            {sending ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <FiSend className="-scale-x-100" />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
