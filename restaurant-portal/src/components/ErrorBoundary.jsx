import React from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

// خطأ تحميل جزء من الحزمة (بعد نشر نسخة جديدة على /portal أو انقطاع النت أثناء التحميل)
const CHUNK_RE = /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically/i;
const RELOAD_KEY = 'wasaly_chunk_reload_at';

export const isChunkError = (e) => CHUNK_RE.test(String(e?.message || e || ''));

// حماية الصفحات: أي خطأ داخل صفحة لا يُسقط التطبيق كله — تنبيهات الطلبات والطباعة (LiveOrdersProvider) تبقى شغّالة
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    // خطأ تحميل جزء: نعيد تحميل الصفحة مرة واحدة فقط (لتجنّب حلقة إعادة تحميل)
    if (isChunkError(error)) {
      let last = 0;
      try { last = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0'); } catch {}
      if (Date.now() - last > 30000) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch {}
        window.location.reload();
      }
    }
  }

  componentDidUpdate(prev) {
    // التنقل لصفحة أخرى يمسح الخطأ
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  retry() {
    if (isChunkError(this.state.error)) { window.location.reload(); return; }
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkError(this.state.error);
    return (
      <div className="card p-7 text-center animate-fade-up max-w-md mx-auto mt-6" role="alert">
        <div className="w-16 h-16 mx-auto mb-3 rounded-[20px] bg-danger-soft text-danger flex items-center justify-center">
          <FiAlertTriangle size={28} aria-hidden />
        </div>
        <p className="font-extrabold text-ink">{chunk ? 'تعذّر تحميل الصفحة' : 'حدث خطأ غير متوقع في هذه الصفحة'}</p>
        <p className="text-[12.5px] text-ink-3 mt-1 leading-relaxed">
          {chunk ? 'تحقق من الإنترنت ثم أعد المحاولة.' : 'استقبال الطلبات والتنبيهات مستمر بشكل طبيعي. جرّب مرة أخرى أو انتقل لصفحة ثانية.'}
        </p>
        <button onClick={this.retry} className="btn-primary mt-5 px-6"><FiRefreshCw size={15} aria-hidden /> إعادة المحاولة</button>
      </div>
    );
  }
}
