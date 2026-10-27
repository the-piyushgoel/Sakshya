import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ title, message, type = "info", duration = 4500 }) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, title, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div 
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";
          const isWarning = toast.type === "warning";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start p-4 rounded-lg shadow-xl border text-sm transition-all transform animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                isSuccess
                  ? "bg-emerald-950/90 text-emerald-100 border-emerald-600/50 backdrop-blur-md"
                  : isError
                  ? "bg-rose-950/90 text-rose-100 border-rose-600/50 backdrop-blur-md"
                  : isWarning
                  ? "bg-amber-950/90 text-amber-100 border-amber-600/50 backdrop-blur-md"
                  : "bg-slate-900/90 text-slate-100 border-slate-700 backdrop-blur-md"
              }`}
            >
              <div className="flex-shrink-0 mr-3 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-blue-400" />}
              </div>
              <div className="flex-1 mr-2">
                {toast.title && <div className="font-semibold text-white tracking-wide">{toast.title}</div>}
                <div className="text-xs opacity-90 mt-0.5 leading-relaxed">{toast.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 text-slate-400 hover:text-white p-1 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

