import React, { useState, useEffect, useRef } from "react";

const BACKEND_BASE = "http://localhost:5000";

/**
 * Props:
 * - ticketId
 * - size (thumbnail width px, default 180)
 * - previewUrl (optional) - base endpoint, default /api/tickets/:id/preview.png
 */
export default function TicketPreviewThumbnail({ ticketId, size = 180, previewUrl, onOpen }) {
  const thumbUrl = previewUrl ? `${previewUrl.replace(":id", ticketId)}?scale=1` : `${BACKEND_BASE}/api/tickets/${ticketId}/preview.png?scale=1`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let createdUrl = null;

    setLoading(true);
    setError(null);

    // Fetch thumbnail as blob
    fetch(thumbUrl, { 
      cache: "no-store",
      signal: controller.signal,
      headers: { 'Accept': 'image/png' }
    })
      .then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (!mounted) return;
        
        // Create object URL
        createdUrl = URL.createObjectURL(blob);
        setThumbnailUrl((prev) => {
          if (prev && prev.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(prev);
            } catch {
              // ignore
            }
          }
          return createdUrl;
        });
        setLoading(false);
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        if (!mounted) return;
        console.warn("Preview thumb load:", err);
        setError(err);
        setLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
      if (createdUrl && createdUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(createdUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [thumbUrl, ticketId]);

  return (
    <>
      <div style={{ width: size, cursor: "pointer", textAlign: "center" }}>
        {loading && (
          <div style={{ 
            width: size, 
            height: size * 1.4, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            background: "var(--rs-surface-2)", 
            color: "var(--rs-text-muted)",
            borderRadius: 6 
          }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ 
            width: size, 
            height: size * 1.4, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            background: "#fff0f0", 
            borderRadius: 6,
            padding: 8,
            fontSize: 12
          }}>
            Preview unavailable
          </div>
        )}
        {!loading && !error && thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={`Ticket ${ticketId}`}
            style={{ 
              width: "100%", 
              borderRadius: 6, 
              boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
              cursor: "pointer"
            }}
            onClick={() => (onOpen ? onOpen(ticketId) : setOpen(true))}
          />
        )}
        <div style={{ marginTop: 6 }}>
          <button 
            onClick={() => (onOpen ? onOpen(ticketId) : setOpen(true))} 
            style={{ 
              padding: "6px 10px", 
              borderRadius: 6, 
              border: "1px solid var(--rs-border)", 
              background: "var(--rs-card-bg)", 
              color: "var(--rs-text-main)",
              cursor: "pointer" 
            }}
          >
            View
          </button>
        </div>
      </div>

      {!onOpen && open && (
        <TicketPreviewModal
          ticketId={ticketId}
          open={open}
          onClose={() => setOpen(false)}
          previewUrl={previewUrl}
        />
      )}
    </>
  );
}

/*
  Simplified modal component - uses direct <img src> with preloading for maximum performance
  - Preloads via new Image() to ensure fully decoded before display
  - Browser handles caching natively
  - Async decoding prevents main thread blocking
  - Fixed container prevents layout jumps
*/

export function TicketPreviewModal({ ticketId, open, onClose }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !ticketId) return;

    let createdUrl = null;

    setError(null);
    setLoading(true);
    setImgSrc(null);

    // Use scale=2 for high-quality preview
    const url = `${BACKEND_BASE}/api/tickets/${ticketId}/preview.png?scale=2`;

    console.log("[TicketPreview] Starting preload for:", url);

    // Fetch as blob and create object URL - this bypasses CORS issues with img tags
    fetch(url, { credentials: 'include' })
      .then(response => {
        console.log("[TicketPreview] Fetch response:", response.status, response.statusText);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        console.log("[TicketPreview] ✅ Got blob:", blob.size, "bytes, type:", blob.type);
        createdUrl = URL.createObjectURL(blob);
        console.log("[TicketPreview] ✅ Created object URL:", createdUrl);
        setImgSrc(createdUrl);
        setLoading(false);
      })
      .catch(err => {
        console.error("[TicketPreview] ❌ Fetch failed:", err);
        setError("Preview load failed. Use Download button below.");
        setLoading(false);
      });

    // Cleanup object URL on unmount
    return () => {
      if (createdUrl && createdUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(createdUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [open, ticketId]);

  // Hotfix: always download from backend path (works even if preload fails)
  const download = () => {
    // Backend path that works directly in browser
    const backendUrl = `${BACKEND_BASE}/api/tickets/${ticketId}/preview.png`;
    
    // Create <a> to force download
    const a = document.createElement("a");
    a.href = backendUrl;
    a.download = `ticket-${ticketId}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openInNewTab = () => {
    window.open(`${BACKEND_BASE}/api/tickets/${ticketId}/preview.png`, "_blank", "noopener,noreferrer");
  };

  if (!open) return null;

  return (
    <div 
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: "70%",
          maxWidth: 1000,
          background: "var(--rs-card-bg)",
          borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
          padding: 12
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          marginBottom: 8
        }}>
          <strong>Ticket Preview</strong>
          <div>
            <button 
              onClick={download}
              style={{
                marginRight: 8,
                background: "#138f53",
                color: "#fff",
                border: "none",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer"
              }}
            >
              Download PNG
            </button>
            <button 
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid var(--rs-border)",
                color: "var(--rs-text-main)",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Preview container */}
        <div style={{ 
          padding: 12,
          maxHeight: "80vh",
          overflow: "auto"
        }}>
          <div style={{
            width: "100%",
            minHeight: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--rs-surface-2)",
            borderRadius: 6
          }}>
            {loading && !imgSrc && (
              <div style={{ color: "var(--rs-text-muted)", padding: 40 }}>
                Loading preview…
              </div>
            )}

            {error && !imgSrc && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ color: "#d9534f", marginBottom: 6 }}>Preview not available</div>
                <div style={{ color: "var(--rs-text-muted)", marginBottom: 12 }}>{error}</div>
                <button 
                  onClick={openInNewTab}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: "#1976d2",
                    color: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Open in New Tab
                </button>
              </div>
            )}

            {imgSrc && (
              <img
                src={imgSrc}
                alt="Ticket preview"
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  transition: "opacity 0.18s ease",
                  opacity: 1
                }}
                onError={() => setError("Could not display image")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
