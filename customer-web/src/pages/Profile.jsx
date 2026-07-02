import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from './Home';

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const doLogout = () => {
    logout();
    nav('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <h1 className="font-black text-gray-900 text-lg">حسابي 👤</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Avatar */}
        <div className="bg-white rounded-3xl p-6 flex items-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-black">
            {user?.name?.[0] || '؟'}
          </div>
          <div>
            <p className="font-black text-gray-900 text-lg">{user?.name || 'زائر'}</p>
            <p className="text-gray-500 text-sm">{user?.phone || ''}</p>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
          <h2 className="font-black text-gray-800">معلوماتي</h2>
          {[
            { label: 'الاسم', value: user?.name },
            { label: 'رقم الهاتف', value: user?.phone },
            { label: 'النوع', value: user?.role === 'customer' ? 'زبون' : user?.role },
          ].map(f => (
            <div key={f.label} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-gray-500 text-sm">{f.label}</span>
              <span className="font-bold text-gray-800 text-sm">{f.value || '-'}</span>
            </div>
          ))}
        </div>

        {/* Links */}
        <div className="bg-white rounded-2xl p-2 shadow-sm">
          {[
            { icon: '📦', label: 'طلباتي', action: () => nav('/orders') },
            { icon: '📍', label: 'عناواني', action: () => nav('/addresses') },
            { icon: '💬', label: 'تواصل معنا', action: () => {} },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-gray-50 transition text-right"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-bold text-gray-800 flex-1">{item.label}</span>
              <span className="text-gray-400">←</span>
            </button>
          ))}
        </div>

        <button onClick={doLogout}
          className="w-full bg-red-50 text-red-500 font-black rounded-2xl py-4 border-2 border-red-100"
        >
          🚪 تسجيل الخروج
        </button>

        <p className="text-center text-xs text-gray-300">وصَلّي v1.0</p>
      </div>

      <BottomNav active="profile" />
    </div>
  );
}
