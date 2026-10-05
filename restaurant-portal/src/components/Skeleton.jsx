import React from 'react';

// بلوك سكيليتون بلمعان — بديل التلويد (يظهر فورًا بدل سبينر)
export function Sk({ w = '100%', h = 16, r = 8, className = '', style = {} }) {
  return <div className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// سكيليتون صفحة كاملة: بطاقة رئيسية + بلاطات مؤشرات + مخطط + قائمة
export default function PageSkeleton({ cards = 4, rows = 6, hero = true }) {
  return (
    <div className="space-y-4 animate-fade-in" aria-busy="true" aria-label="جاري التحميل">
      <div className="flex items-center gap-3">
        <Sk w={44} h={44} r={14} />
        <div className="space-y-2 flex-1"><Sk w="30%" h={18} /><Sk w="20%" h={11} /></div>
      </div>
      {hero && <Sk h={150} r={24} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <Sk w={40} h={40} r={14} />
            <Sk w="60%" h={22} />
            <Sk w="40%" h={11} />
          </div>
        ))}
      </div>
      <div className="card p-4 space-y-3">
        <Sk w="35%" h={16} />
        <Sk h={160} r={14} />
      </div>
      <div className="card p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Sk w={44} h={44} r={12} />
            <div className="flex-1 space-y-2"><Sk w="45%" h={14} /><Sk w="25%" h={11} /></div>
            <Sk w={70} h={28} r={999} />
          </div>
        ))}
      </div>
    </div>
  );
}
