import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

const ADMIN_PHONE = '0599039704';

export default function SupportWidget() {
  const [menu, setMenu] = useState(false);
  const [chat, setChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const loggedIn = !!localStorage.getItem('token');

  const load = () => api.get('/support/chat').then(r => setMessages(r.data || [])).catch(() => {});
  useEffect(() => {
    if (!chat) return;
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [chat]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setText('');
    try { await api.post('/support/chat', { message: msg }); load(); } catch {}
  };

  if (!loggedIn) return null;

  return (
    <div dir="rtl">
      {/* نافذة الشات */}
      {chat && (
        <div className="fixed bottom-24 left-4 z-[60] w-[320px] max-w-[90vw] h-[440px] max-h-[70vh] bg-white rounded-2xl shadow-card border border-gray-100 flex flex-col overflow-hidden">
          <div className="bg-gradient-to-l from-orange-500 to-orange-600 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-black leading-none">وصلي إدارة</p>
              <p className="text-[11px] text-white/80 mt-0.5">الدعم الفني</p>
            </div>
            <button onClick={() => setChat(false)} className="text-white text-xl leading-none">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {messages.length === 0 && <p className="text-center text-gray-400 text-sm mt-6">ابدأ محادثة مع فريق وصلي 👋</p>}
            {messages.map(m => (
              <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.sender === 'user' ? 'bg-orange-500 text-white mr-auto rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 ml-auto rounded-bl-sm'}`}>
                {m.message}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t border-gray-100 flex items-end gap-2">
            <textarea rows={1} className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="اكتب رسالتك..." value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button onClick={send} className="w-10 h-10 rounded-full bg-orange-500 text-white flex-shrink-0 flex items-center justify-center">➤</button>
          </div>
        </div>
      )}

      {/* أزرار الخيارات */}
      {menu && !chat && (
        <div className="fixed bottom-24 left-4 z-[60] flex flex-col gap-2 items-start">
          <button onClick={() => { setMenu(false); setChat(true); }}
            className="flex items-center gap-2 bg-green-500 text-white px-4 py-2.5 rounded-full font-bold text-sm shadow-lg">
            💬 تشات مع الإدارة
          </button>
          <a href={`tel:${ADMIN_PHONE}`} onClick={() => setMenu(false)}
            className="flex items-center gap-2 bg-green-700 text-white px-4 py-2.5 rounded-full font-bold text-sm shadow-lg">
            📞 اتصل بوصلي
          </a>
        </div>
      )}

      {/* الزر العائم */}
      <button onClick={() => (chat ? setChat(false) : setMenu(m => !m))}
        className="fixed bottom-24 right-4 z-[60] w-14 h-14 rounded-full bg-orange-500 text-white text-2xl shadow-brand flex items-center justify-center">
        {(menu || chat) ? '✕' : '🎧'}
      </button>
    </div>
  );
}
