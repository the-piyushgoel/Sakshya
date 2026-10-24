import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { ApiError } from '../api/client';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  code?: string;
}
interface ToastRecord extends ToastInput { id: number }
interface ToastContextValue { pushToast: (toast: ToastInput) => void }
const ToastContext = createContext<ToastContextValue | null>(null);
let nextToastId = 1;

const toastVisuals = {
  success: { Icon: CheckCircle2, className: 'toast-success' },
  info: { Icon: Info, className: 'toast-info' },
  warning: { Icon: TriangleAlert, className: 'toast-warning' },
  error: { Icon: XCircle, className: 'toast-error' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const removeToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const pushToast = useCallback((toast: ToastInput) => {
    const id = nextToastId++;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => removeToast(id), 6000);
  }, [removeToast]);
  useEffect(() => {
    const onApiError = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!(detail instanceof ApiError)) return;
      pushToast({
        title: detail.message,
        description: detail.status ? `Request failed with status ${detail.status}.` : 'The Sakshya API could not be reached.',
        tone: 'error',
        code: detail.code,
      });
    };
    window.addEventListener('sakshya:api-error', onApiError);
    return () => window.removeEventListener('sakshya:api-error', onApiError);
  }, [pushToast]);
  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map(({ id, tone = 'info', title, description, code }) => {
          const { Icon, className } = toastVisuals[tone];
          return <div key={id} role={tone === 'error' ? 'alert' : 'status'} className={`toast-item ${className}`}>
            <Icon size={19} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p>{description && <p className="mt-0.5 text-sm opacity-80">{description}</p>}{code && <p className="mt-1 font-mono text-xs">Code: {code}</p>}</div>
            <button className="toast-close" aria-label="Dismiss notification" onClick={() => removeToast(id)}><X size={16} /></button>
          </div>;
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToasts must be used inside ToastProvider');
  return value;
}
