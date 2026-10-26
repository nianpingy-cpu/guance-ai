import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-wrap">
          <div className="card flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
            <AlertTriangle size={26} className="text-warning" />
            <h1 className="mt-3 text-[20px] font-bold text-ink">页面暂时无法显示</h1>
            <p className="mt-1 max-w-md text-[12px] leading-5 text-muted">
              演示数据可能处于不兼容状态。可以尝试恢复演示数据；若问题持续，请刷新页面。
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
                刷新页面
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  localStorage.removeItem('guancha-ai-mvp-v04');
                  window.location.href = '/dashboard';
                }}
              >
                恢复演示数据
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
