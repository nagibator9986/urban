import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure in dev so we catch regressions quickly.
    if (import.meta.env?.DEV) {
      console.error("[ErrorBoundary]", error, info);
    }
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        style={{
          padding: "48px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          color: "var(--text, #E5E7EB)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ margin: 0 }}>Что-то пошло не так</h2>
        <p style={{ color: "var(--muted, #94A3B8)", maxWidth: 540 }}>
          Мы не смогли отрендерить эту страницу. Попробуйте обновить, или вернитесь на
          главную.
        </p>
        <pre
          style={{
            maxWidth: 680,
            overflow: "auto",
            padding: 12,
            borderRadius: 8,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            fontSize: 12,
            color: "#FCA5A5",
          }}
        >
          {this.state.error.message}
        </pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={this.handleReset}>
            Попробовать снова
          </button>
          <button className="btn" onClick={() => (window.location.href = "/")}>
            На главную
          </button>
        </div>
      </div>
    );
  }
}
