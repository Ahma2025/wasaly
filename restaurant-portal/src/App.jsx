import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Menu from './pages/Menu';
import Settings from './pages/Settings';
import Login from './pages/Login';

function Layout() {
  const navigate = useNavigate();
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');
  const logout = () => { localStorage.clear(); navigate('/login'); };

  const links = [
    { to: '/', label: 'لوحة التحكم', icon: '📊' },
    { to: '/orders', label: 'الطلبات', icon: '📦' },
    { to: '/menu', label: 'المنيو', icon: '🍽️' },
    { to: '/settings', label: 'الإعدادات', icon: '⚙️' }
  ];

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-l shadow-sm flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            {restaurant.logo && <img src={restaurant.logo} className="w-10 h-10 rounded-xl" />}
            <div>
              <p className="font-bold text-gray-900 text-sm">{restaurant.name_ar}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${restaurant.is_open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {restaurant.is_open ? 'مفتوح' : 'مغلق'}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {links.map(link => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <span>{link.icon}</span>{link.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t">
          <button onClick={logout} className="w-full text-red-500 hover:bg-red-50 py-2 rounded-xl text-sm font-medium">
            🚪 تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: 'inherit', direction: 'rtl' } }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><Layout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
