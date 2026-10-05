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
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="card text-center py-14 px-6 max-w-lg mx-auto animate-fade-up">
          <div className="w-[72px] h-[72px] mx-auto rounded-[24px] bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center text-3xl mb-4 shadow-[0_12px_28px_rgba(240,68,56,.3)] animate-pop">!</div>
          <p className="font-black text-ink text-lg">{chunk ? 'تعذّر تحميل الصفحة' : 'حدث خطأ غير متوقع'}</p>
          <p className="text-sm text-ink-3 mt-1.5">{chunk ? 'تحقق من الاتصال ثم أعد المحاولة.' : 'أعد المحاولة، وإذا تكرر الخطأ أعد تشغيل التطبيق.'}</p>
          <div className="flex gap-2 justify-center mt-6">
            <button onClick={() => this.setState({ error: null })} className="btn btn-primary">إعادة المحاولة</button>
            <button onClick={() => window.location.reload()} className="btn btn-secondary">إعادة تحميل</button>
          </div>
        </div>
      </div>
    );
  }
}
