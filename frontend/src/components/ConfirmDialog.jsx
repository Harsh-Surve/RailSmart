import React from "react";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const handleCancel = () => {
    if (loading) return;
    onCancel?.();
  };

  const handleConfirm = () => {
    if (loading) return;
    onConfirm?.();
  };

  const spinner = (
    <span
      aria-hidden="true"
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.45)",
        borderTopColor: "#ffffff",
        display: "inline-block",
        animation: "rsSpin 0.75s linear infinite",
      }}
    />
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        opacity: 0,
        animation: "rsFadeIn 160ms ease-out forwards",
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          background: "var(--rs-card-bg)",
          borderRadius: "16px",
          padding: "1.5rem 1.75rem",
          minWidth: "320px",
          maxWidth: "420px",
          boxShadow: "0 20px 45px rgba(15,23,42,0.35)",
          border: "1px solid var(--rs-border)",
          transform: "scale(0.96)",
          opacity: 0,
          animation: "rsPopIn 180ms ease-out forwards",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            marginBottom: "0.5rem",
            fontSize: "1.05rem",
            fontWeight: 600,
            color: "var(--rs-text-main)",
          }}
        >
          {title}
        </h3>

        {message && (
          <p
            style={{
              margin: 0,
              marginBottom: "1rem",
              fontSize: "0.9rem",
              color: "var(--rs-text-muted)",
            }}
          >
            {message}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "0.25rem",
          }}
        >
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid var(--rs-border)",
              background: "var(--rs-surface-2)",
              color: "var(--rs-text-main)",
              fontSize: "0.85rem",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.65 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "999px",
              border: "none",
              background: "#b91c1c",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.85 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {loading ? spinner : null}
            {loading ? "Cancelling…" : confirmLabel}
          </button>
        </div>
      </div>

      {/* Local keyframes to avoid global CSS edits */}
      <style>{
        "@keyframes rsFadeIn{from{opacity:0}to{opacity:1}}" +
          "@keyframes rsPopIn{from{transform:scale(0.96);opacity:0}to{transform:scale(1);opacity:1}}" +
          "@keyframes rsSpin{to{transform:rotate(360deg)}}"
      }</style>
    </div>
  );
}