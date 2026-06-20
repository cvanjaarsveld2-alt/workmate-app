// ─── Error Boundary ─────────────────────────────────────────────────────────
// Wraps each screen so a runtime error in one place doesn't kill the whole app.
// Shows a friendly message + a "back to home" + retry, and logs the error for
// the diagnostics screen to display.
//
// Implemented as a class because React's error boundary API requires
// getDerivedStateFromError + componentDidCatch — there's no hooks equivalent.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

// Crash log lives in localStorage so the Diagnostics screen can read it back.
const CRASH_LOG_KEY = "powermate_crash_log";
const MAX_CRASHES = 20;

export function logCrash(entry) {
  try {
    const raw = localStorage.getItem(CRASH_LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({
      ...entry,
      at: new Date().toISOString(),
    });
    localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(list.slice(0, MAX_CRASHES)));
  } catch {} // swallow — diagnostics is best-effort
}

export function readCrashLog() {
  try {
    const raw = localStorage.getItem(CRASH_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearCrashLog() {
  try { localStorage.removeItem(CRASH_LOG_KEY); } catch {}
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Persist for the Diagnostics screen.
    logCrash({
      screen: this.props.label || "unknown",
      message: error?.message || String(error),
      stack: (error?.stack || "").split("\n").slice(0, 6).join("\n"),
      componentStack: (info?.componentStack || "").split("\n").slice(0, 6).join("\n"),
    });
    console.error("[ErrorBoundary]", this.props.label, error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  goHome = () => {
    this.reset();
    if (typeof this.props.onGoHome === "function") this.props.onGoHome();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-md mx-auto">
          <div className="rounded-2xl bg-white border-2 border-red-100 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-black text-slate-900">Something went wrong</p>
                <p className="text-xs text-slate-500">{this.props.label || "Screen"} couldn't load</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-2">
              The rest of the app is still working. You can try again, go back home, or check the
              Diagnostics screen in Settings for details.
            </p>

            {this.state.error?.message && (
              <p className="text-xs font-mono text-red-700 bg-red-50 rounded-lg p-2 mb-4 break-all">
                {this.state.error.message}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={this.reset}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border-2 border-slate-200 bg-white text-slate-700 min-h-[48px]">
                <RotateCw size={14} /> Try again
              </button>
              <button
                onClick={this.goHome}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                style={{ background: "#8B1A1A" }}>
                <Home size={14} /> Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
