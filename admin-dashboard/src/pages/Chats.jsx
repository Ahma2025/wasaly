import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Chats() {
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // {user_id, name, role_ar}
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  const loadConvos = () => api.get('/support/chat/conversations').then(r => setConvos(r.data || [])).catch(() => toast.error('فشل التحميل')).finally(() => setLoading(false));
  useEffect(() => { loadConvos(); const t = setInterval(loadConvos, 6000); return () => clearInterval(t); }, []);

  const loadThread = (uid) => api.get(`/support/chat/user/${uid}`).then(r => setMessages(r.data || [])).catch(() => {});
  useEffect(() => {
    if (!active) return;
    loadThread(active.user_id);
    const t = setInterval(() => loadThread(active.user_id), 4000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || !active) return;
    setText('');
    try { await api.post(`/support/chat/user/${active.user_id}`, { message: msg }); loadThread(active.user_id); } catch { toast.error('فشل الإرسال'); }
  };

  // شاشة المحادثة المفتوحة
  if (active) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)]" dir="rtl">
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-soft">
          <button onClick={() => setActive(null)} className="text-gray-500 text-xl">→</button>
          <div>
            <p className="font-black text-gray-900 leading-none">{active.name || 'مستخدم'} <span className="text-orange-500 text-xs">({active.role_ar})</span></p>
            <p className="text-[11px] text-gray-400 mt-0.5">{active.phone || ''}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
          {messages.map(m => (
            <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.sender === 'admin' ? 'bg-orange-500 text-white mr-auto rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 ml-auto rounded-bl-sm'}`}>
              {m.message}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="p-2 border-t border-gray-100 flex items-end gap-2 bg-white">
          <textarea rows={1} className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="ردّك..." value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button onClick={send} className="w-10 h-10 rounded-full bg-orange-500 text-white flex-shrink-0">➤</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 animate-fade-up" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">المحادثات 💬</h1>
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : convos.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><p className="text-5xl mb-3">💬</p><p className="font-semibold">لا توجد محادثات بعد</p></div>
      ) : (
        convos.map(c => (
          <button key={c.user_id} onClick={() => setActive(c)}
            className="w-full text-right bg-white rounded-2xl p-4 shadow-soft border border-gray-100 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center text-lg font-black text-orange-600 flex-shrink-0">
              {c.name?.[0] || '؟'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm leading-none truncate">
                {c.name || 'مستخدم'} <span className="text-orange-500 text-xs">({c.role_ar})</span>
              </p>
              <p className="text-xs text-gray-400 mt-1 truncate">{c.last_message}</p>
            </div>
            {parseInt(c.unread) > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{c.unread}</span>
            )}
          </button>
        ))
      )}
    </div>
  );
}
