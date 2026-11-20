import { Component } from "react";

/* 全局错误边界：任何页面渲染崩溃时给出可操作的兜底界面，而不是整页空白 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("页面崩溃：", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-medium text-slate-700">这个页面出错了</p>
          <p className="max-w-md text-xs text-slate-400">{String(this.state.error?.message || this.state.error)}</p>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
            >
              重试
            </button>
            <button
              onClick={() => { location.hash = "#/"; location.reload(); }}
              className="rounded-lg bg-terracotta px-4 py-2 text-xs font-medium text-white hover:opacity-90"
            >
              回到总览
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
