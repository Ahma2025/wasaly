import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiHeadphones, FiX, FiMessageCircle, FiPhone, FiSend, FiChevronLeft } from 'react-icons/fi';
import api from '../utils/api';
import { SUPPORT_PHONE } from '../utils/config';
import { formatDateTime } from '../utils/format';
import { cx, useOverlay } from './ui';
import { pl } from '../utils/plural';

// عدّاد «المقروء» لكل حساب على حدة (كان مشتركًا بين كل الحسابات على نفس الجهاز)
const seenKey = () => {
  let uid = '';
  try { uid = JSON.parse(localStorage.getItem('user') || 'null')?.id ?? ''; } catch {}
  return `support_seen_admin_${uid || 'anon'}`;
};
const isMine = (m) => m.sender === 'user' || m.sender === 'restaurant' || m.is_mine === true;
const QUICK = ['مشكلة في طلب', 'تعديل بيانات المطعم', 'استفسار عن المستحقات', 'مشكلة في الطابعة'];
// بصمة القائمة: لا نعيد الرسم/التمرير إن لم يتغير شيء
const sig = (list) => `${list.length}:${list[list.length - 1]?.id ?? ''}`;

// زر الدعم العائم — فوق القائمة السفلية ويحترم المساحة الآمنة
export default function SupportWidget() {
  const [menu, setMenu] = useState(false);
  const [chat, setChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const endRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const sigRef = useRef('');
  const nearBottom = useRef(true);
  const loggedIn = !!localStorage.getItem('token');

  // زر الرجوع / Esc يغلق اللوحة المفتوحة (الأعلى فقط)
  useOverlay(menu || chat, () => { setMenu(false); setChat(false); });

  const load = useCallback(() => api.get('/support/chat').then(r => {
    const list = r?.data || [];
    const s = sig(list);
    if (s !== sigRef.current) { sigRef.current = s; setMessages(list); }
    return list;
  }).catch(() => null), []);

  const adminCount = (list) => list.filter(m => !isMine(m)).length;

  // أثناء فتح المحادثة: تحديث كل 4 ثوانٍ
  useEffect(() => {
    if (!chat) return;
    nearBottom.current = true;
    sigRef.current = '';
    load().then(list => { if (list) { localStorage.setItem(seenKey(), String(adminCount(list))); setUnread(0); } });
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load().then(list => { if (list) localStorage.setItem(seenKey(), String(adminCount(list))); });
    }, 4000);
    return () => clearInterval(t);
  }, [chat, load]);

  // مغلقة: فحص خفيف للرسائل الجديدة من الإدارة كل دقيقة
  useEffect(() => {
    if (chat || !loggedIn) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      load().then(list => {
        if (!list) return;
        const seen = parseInt(localStorage.getItem(seenKey()) || '0');
        setUnread(Math.max(0, adminCount(list) - seen));
      });
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [chat, loggedIn, load]);

  // التمرير للأسفل فقط عند وصول رسالة جديدة وكان المستخدم قريبًا من الأسفل (لا يقاطع قراءة الرسائل القديمة)
  useEffect(() => {
    if (!chat || !nearBottom.current) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chat]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setText(''); setSending(true);
    nearBottom.current = true;
    sigRef.current = '';
    setMessages(m => [...m, { id: `tmp-${Date.now()}`, sender: 'user', message: msg, created_at: new Date().toISOString(), pending: true }]);
    try { await api.post('/support/chat', { message: msg }); sigRef.current = ''; await load(); }
    catch { setText(msg); setMessages(m => m.filter(x => !x.pending)); }
    finally { setSending(false); }
  };

  if (!loggedIn) return null;

  const fabBottom = 'calc(var(--nav-offset) + 14px)';
  const panelBottom = 'calc(var(--nav-offset) + 78px)';
  const open = menu || chat;

  return (
    <div dir="rtl">
      {open && <div className="fixed inset-0 z-[55] bg-ink/20 backdrop-blur-[1px] animate-fade-in" onClick={() => { setMenu(false); setChat(false); }} />}

      {chat && (
        <div role="dialog" aria-label="محادثة الدعم"
          className="fixed left-4 z-[60] bg-white rounded-[28px] shadow-lift border border-surface-line flex flex-col overflow-hidden animate-pop origin-bottom-left"
          style={{ bottom: panelBottom, width: 'min(380px, calc(100vw - 32px))', height: 'min(540px, calc(100vh - var(--sat) - var(--nav-offset) - 120px))' }}>
          <div className="grad-mesh text-white px-4 py-3.5 flex items-center gap-3 sheen">
            <div className="relative z-[1] w-11 h-11 rounded-[14px] glass flex items-center justify-center">
              <FiHeadphones size={19} aria-hidden />
              <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full bg-emerald-300 ring-2 ring-white/80" aria-hidden />
            </div>
            <div className="flex-1 relative z-[1]">
              <p className="font-extrabold leading-none">دعم وصلّي</p>
              <p className="text-[11.5px] text-white/85 mt-1.5">فريقنا يرد عليك بأسرع وقت</p>
            </div>
            <button onClick={() => setChat(false)} aria-label="إغلاق المحادثة" className="relative z-[1] w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"><FiX /></button>
          </div>
          <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 bg-surface" aria-live="polite">
            {messages.length === 0 && (
              <div className="text-center mt-6 px-4 animate-fade-up">
                <div className="w-16 h-16 mx-auto rounded-[20px] bg-white shadow-soft text-brand-500 flex items-center justify-center mb-3"><FiMessageCircle size={28} aria-hidden /></div>
                <p className="font-extrabold text-ink">كيف نقدر نساعدك؟</p>
                <p className="text-[12.5px] text-ink-3 mt-1">اختر موضوعًا أو اكتب رسالتك</p>
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  {QUICK.map(q => (
                    <button key={q} onClick={() => { setText(q + ': '); inputRef.current?.focus(); }}
                      className="h-8 px-3 rounded-full bg-white border border-surface-line text-[12px] font-bold text-ink-2 hover:border-brand-300 hover:text-brand-600">{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => {
              const mine = isMine(m);
              return (
                // في RTL: رسائلي على اليمين (start) ورسائل الإدارة على اليسار (end)
                <div key={m.id} className={cx('max-w-[82%] animate-fade-up', mine ? 'self-start' : 'self-end')}>
                  <div className={cx('px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words',
                    mine ? 'grad-brand text-white rounded-[18px] rounded-tr-md shadow-[0_6px_16px_rgba(255,107,0,.2)]' : 'bg-white border border-surface-line text-ink rounded-[18px] rounded-tl-md shadow-soft',
                    m.pending && 'opacity-70')}>
                    {m.message}
                  </div>
                  <p className={cx('text-[10px] text-ink-3 mt-1 px-1', mine ? 'text-right' : 'text-left')}>
                    {m.pending ? 'جارٍ الإرسال…' : m.created_at ? formatDateTime(m.created_at) : ''}
                  </p>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="p-2.5 border-t border-surface-line flex items-end gap-2 bg-white">
            <textarea ref={inputRef} rows={1} className="input flex-1 resize-none max-h-28 !h-auto min-h-[46px] py-2.5 rounded-[18px] bg-surface border-transparent focus:bg-white" placeholder="اكتب رسالتك…" value={text} aria-label="نص الرسالة"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button onClick={send} disabled={!text.trim() || sending} aria-label="إرسال"
              className="w-[46px] h-[46px] rounded-full grad-brand text-white flex-shrink-0 flex items-center justify-center shadow-brand disabled:opacity-40 disabled:shadow-none">
              <FiSend className="-scale-x-100" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {menu && !chat && (
        <div className="fixed left-4 z-[60] flex flex-col gap-2 items-start stagger" style={{ bottom: panelBottom }}>
          <button onClick={() => { setMenu(false); setChat(true); }}
            className="flex items-center gap-3 bg-white text-ink ps-2 pe-3 h-14 rounded-[18px] font-bold text-sm shadow-lift border border-surface-line min-w-[230px]">
            <span className="w-10 h-10 rounded-[12px] bg-brand-50 text-brand-600 flex items-center justify-center"><FiMessageCircle size={18} aria-hidden /></span>
            <span className="flex-1 text-right">محادثة مع الإدارة</span>
            {unread > 0 ? <span className="chip bg-coral text-white tnum" aria-label={`${pl(unread, 'message')} جديدة`}>{unread}</span> : <FiChevronLeft className="text-ink-3" aria-hidden />}
          </button>
          <a href={`tel:${SUPPORT_PHONE}`} onClick={() => setMenu(false)}
            className="pressable flex items-center gap-3 bg-white text-ink ps-2 pe-3 h-14 rounded-[18px] font-bold text-sm shadow-lift border border-surface-line min-w-[230px]">
            <span className="w-10 h-10 rounded-[12px] bg-success-soft text-success flex items-center justify-center"><FiPhone size={18} aria-hidden /></span>
            <span className="flex-1">اتصل بوصلّي</span>
            <span dir="ltr" className="text-[11px] text-ink-3 tnum">{SUPPORT_PHONE}</span>
          </a>
        </div>
      )}

      <button onClick={() => (chat ? setChat(false) : setMenu(m => !m))}
        aria-label={open ? 'إغلاق الدعم' : 'الدعم الفني'} aria-expanded={open}
        className={cx('fixed left-4 z-[60] w-[52px] h-[52px] rounded-[18px] text-white flex items-center justify-center',
          open ? 'bg-ink shadow-lift' : 'grad-brand shadow-brand', unread > 0 && !open && 'pulse-dot')}
        style={{ bottom: fabBottom }}>
        <span className={cx('transition-transform duration-300 ease-spring', open && 'rotate-90')}>
          {open ? <FiX size={22} aria-hidden /> : <FiHeadphones size={22} aria-hidden />}
        </span>
        {unread > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-coral text-[10.5px] font-black flex items-center justify-center ring-2 ring-white tnum">{unread}</span>
        )}
      </button>
    </div>
  );
}
