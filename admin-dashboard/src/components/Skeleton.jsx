import React from 'react';

// بلوك سكيليتون بلمعان — بديل التلويد (يظهر فورًا بدل سبينر)
export function Sk({ w = '100%', h = 16, r = 8, className = '', style = {} }) {
  return <div className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

// سكيليتون صفحة كاملة: عنوان + صف بطاقات إحصاء + قائمة
export default function PageSkeleton({ cards = 4, rows = 6 }) {
  return (
    <div className="space-y-5 animate-fade-up" role="status" aria-label="جاري التحميل">
      <div className="flex items-center gap-3">
        <Sk w={48} h={48} r={16} />
        <div className="space-y-2 flex-1"><Sk w={160} h={20} /><Sk w={110} h={11} /></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <Sk w={40} h={40} r={13} />
            <Sk w="45%" h={11} />
            <Sk w="65%" h={24} />
          </div>
        ))}
      </div>
      <div className="card p-4 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.1 }}>
            <Sk w={44} h={44} r={14} />
            <div className="flex-1 space-y-2">
              <Sk w="45%" h={14} />
              <Sk w="25%" h={11} />
            </div>
            <Sk w={70} h={26} r={999} />
          </div>
        ))}
      </div>
    </div>
  );
}
