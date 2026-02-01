import React, { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { type, message }

  const showToast = useCallback((type, message, duration = 3000) => {
    setToast({ type, message });
    if (duration) {
      setTimeout(() => setToast(null), duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg text-sm text-white flex items-center gap-2 ${
              toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
            }`}
          >
            <span>{toast.type === "success" ? "✅" : "⚠️"}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
