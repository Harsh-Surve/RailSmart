import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep this for console debugging
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.title || "Something went wrong";
    const message = this.state.error?.message || String(this.state.error || "Unknown error");

    return (
      <div
        style={{
          minHeight: "60vh",
          padding: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(760px, 95vw)",
            background: "var(--rs-card-bg)",
            border: "1px solid var(--rs-border)",
            borderRadius: 16,
            padding: "1.25rem 1.25rem",
            boxShadow: "0 20px 45px rgba(15,23,42,0.35)",
          }}
        >
          <h2 style={{ margin: 0, marginBottom: "0.5rem" }}>{title}</h2>
          <p style={{ margin: 0, color: "var(--rs-text-muted)", marginBottom: "0.75rem" }}>
            A page error occurred. This prevents a blank screen.
          </p>
          <div
            style={{
              padding: "0.75rem",
              borderRadius: 12,
              background: "var(--rs-surface-2)",
              border: "1px solid var(--rs-border)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: "0.9rem",
              whiteSpace: "pre-wrap",
              color: "var(--rs-text-main)",
            }}
          >
            {message}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button
              type="button"
              className="rs-btn-outline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
            <button type="button" className="rs-btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
