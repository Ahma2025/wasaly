import React from 'react';

/** يلتقط أخطاء العرض/تحميل الصفحات (مثلاً chunk قديم بعد تحديث) ويعرض إعادة محاولة بدل شاشة بيضاء */
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[admin] page error:', error); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Importing a module script/i.test(String(this.state.error?.message));
    return (
      <div className="p-6">
        <div className="card text-center py-10 px-6">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-red-50 flex items-center justify-center text-3xl mb-3">⚠️</div>
          <p className="font-black text-gray-900">{chunk ? 'تعذّر تحميل الصفحة' : 'حدث خطأ غير متوقع'}</p>
          <p className="text-xs text-gray-400 mt-1">{chunk ? 'تحقق من الاتصال ثم أعد المحاولة.' : 'أعد المحاولة، وإذا تكرر الخطأ أعد تشغيل التطبيق.'}</p>
          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => this.setState({ error: null })} className="btn-lux px-5 py-2.5 text-sm">إعادة المحاولة</button>
            <button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">إعادة تحميل</button>
          </div>
        </div>
      </div>
    );
  }
}
