import React from 'react';

// بلوك سكيليتون بلمعان — بديل التلويد (يظهر فورًا بدل سبينر)
export function Sk({ w = '100%', h = 16, r = 8, className = '', style = {} }) {
  return <div className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// سكيليتون صفحة كاملة: صف بطاقات إحصاء + جدول/شبكة
export default function PageSkeleton({ cards = 4, rows = 6 }) {
  return (
    <div className="space-y-6 animate-[fadeUp_.3s_ease]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-soft space-y-3">
            <Sk w={40} h={40} r={12} />
            <Sk w="60%" h={22} />
            <Sk w="40%" h={12} />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-soft space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Sk w={44} h={44} r={12} />
            <div className="flex-1 space-y-2">
              <Sk w="45%" h={14} />
              <Sk w="25%" h={11} />
            </div>
            <Sk w={70} h={28} r={999} />
          </div>
        ))}
      </div>
    </div>
  );
}
