import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiHeadphones, FiX, FiMessageCircle, FiPhone, FiSend } from 'react-icons/fi';
import api from '../utils/api';
import { SUPPORT_PHONE } from '../utils/config';
import { formatDateTime } from '../utils/format';

const SEEN_KEY = 'support_seen_admin';
const isMine = (m) => m.sender === 'user' || m.sender === 'restaurant' || m.is_mine === true;

// زر الدعم العائم — فوق القائمة السفلية ويحترم المساحة الآمنة
export default function SupportWidget() {
  const [menu, setMenu] = useState(false);
  const [chat, setChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const endRef = useRef(null);
  const loggedIn = !!localStorage.getItem('token');

  const load = useCallback(() => api.get('/support/chat').then(r => {
    const list = r?.data || [];
    setMessages(list);
    return list;
  }).catch(() => null), []);

  const adminCount = (list) => list.filter(m => !isMine(m)).length;

  // أثناء فتح المحادثة: تحديث كل 4 ثوانٍ
  useEffect(() => {
    if (!chat) return;
    load().then(list => { if (list) { localStorage.setItem(SEEN_KEY, String(adminCount(list))); setUnread(0); } });
    const t = setInterval(() => load().then(list => { if (list) localStorage.setItem(SEEN_KEY, String(adminCount(list))); }), 4000);
    return () => clearInterval(t);
  }, [chat, load]);

  // مغلقة: فحص خفيف للرسائل الجديدة من الإدارة كل دقيقة
  useEffect(() => {
    if (chat || !loggedIn) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      load().then(list => {
        if (!list) return;
        const seen = parseInt(localStorage.getItem(SEEN_KEY) || '0');
        setUnread(Math.max(0, adminCount(list) - seen));
      });
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [chat, loggedIn, load]);

  useEffect(() => { if (chat) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, chat]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setText(''); setSending(true);
    setMessages(m => [...m, { id: `tmp-${Date.now()}`, sender: 'user', message: msg, created_at: new Date().toISOString(), pending: true }]);
    try { await api.post('/support/chat', { message: msg }); await load(); }
    catch { setText(msg); setMessages(m => m.filter(x => !x.pending)); }
    finally { setSending(false); }
  };

  if (!loggedIn) return null;

  const fabBottom = 'calc(var(--nav-h) + var(--sab) + 14px)';
  const panelBottom = 'calc(var(--nav-h) + var(--sab) + 78px)';

  return (
    <div dir="rtl">
      {(menu || chat) && <div className="fixed inset-0 z-[55] bg-black/10 animate-fade-in" onClick={() => { setMenu(false); setChat(false); }} />}

      {chat && (
        <div role="dialog" aria-label="محادثة الدعم"
          className="fixed left-4 z-[60] bg-white rounded-3xl shadow-card border border-gray-100 flex flex-col overflow-hidden animate-sheet"
          style={{ bottom: panelBottom, width: 'min(360px, calc(100vw - 32px))', height: 'min(480px, calc(100vh - var(--sat) - var(--nav-h) - var(--sab) - 120px))' }}>
          <div className="grad-brand text-white px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl glass flex items-center justify-center"><FiHeadphones aria-hidden /></div>
            <div className="flex-1">
              <p className="font-black leading-none">دعم وصلّي</p>
              <p className="text-[11px] text-white/85 mt-1">نرد عليك بأسرع وقت</p>
            </div>
            <button onClick={() => setChat(false)} aria-label="إغلاق المحادثة" className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center"><FiX /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-gray-50">
            {messages.length === 0 && <p className="text-center text-gray-400 text-sm mt-8">ابدأ محادثة مع فريق وصلّي</p>}
            {messages.map(m => {
              const mine = isMine(m);
              return (
                // في RTL: رسائلي على اليمين (start) ورسائل الإدارة على اليسار (end)
                <div key={m.id} className={`max-w-[82%] ${mine ? 'self-start' : 'self-end'}`}>
                  <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${mine ? 'bg-brand-500 text-white rounded-tr-md' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-md'} ${m.pending ? 'opacity-70' : ''}`}>
                    {m.message}
                  </div>
                  {m.created_at && <p className={`text-[10px] text-gray-400 mt-0.5 ${mine ? 'text-right' : 'text-left'}`}>{formatDateTime(m.created_at)}</p>}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t border-gray-100 flex items-end gap-2 bg-white">
            <textarea rows={1} className="input flex-1 resize-none max-h-28" placeholder="اكتب رسالتك…" value={text} aria-label="نص الرسالة"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button onClick={send} disabled={!text.trim() || sending} aria-label="إرسال"
              className="w-11 h-11 rounded-full grad-brand text-white flex-shrink-0 flex items-center justify-center shadow-brand disabled:opacity-50">
              <FiSend className="-scale-x-100" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {menu && !chat && (
        <div className="fixed left-4 z-[60] flex flex-col gap-2 items-start animate-sheet" style={{ bottom: panelBottom }}>
          <button onClick={() => { setMenu(false); setChat(true); }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-3 rounded-2xl font-bold text-sm shadow-card border border-gray-100">
            <span className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><FiMessageCircle aria-hidden /></span>
            محادثة مع الإدارة
            {unread > 0 && <span className="chip bg-rose-500 text-white">{unread}</span>}
          </button>
          <a href={`tel:${SUPPORT_PHONE}`} onClick={() => setMenu(false)}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-3 rounded-2xl font-bold text-sm shadow-card border border-gray-100">
            <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><FiPhone aria-hidden /></span>
            اتصل بوصلّي
          </a>
        </div>
      )}

      <button onClick={() => (chat ? setChat(false) : setMenu(m => !m))}
        aria-label={menu || chat ? 'إغلاق الدعم' : 'الدعم الفني'} aria-expanded={menu || chat}
        className="fixed left-4 z-[60] w-12 h-12 rounded-2xl grad-brand text-white shadow-brand flex items-center justify-center"
        style={{ bottom: fabBottom }}>
        {(menu || chat) ? <FiX size={22} aria-hidden /> : <FiHeadphones size={22} aria-hidden />}
        {unread > 0 && !menu && !chat && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-black flex items-center justify-center ring-2 ring-white">{unread}</span>
        )}
      </button>
    </div>
  );
}
