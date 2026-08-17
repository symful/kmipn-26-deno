import { useState, useCallback, useEffect } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;
const listeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notify(listeners: Array<(toasts: Toast[]) => void>, toasts: Toast[]) {
  listeners.forEach((listener) => listener([...toasts]));
}

export const toast = {
  success: (message: string) => {
    const id = String(++toastId);
    toasts = [...toasts, { id, message, type: "success" }];
    notify(listeners, toasts);
    setTimeout(() => toast.dismiss(id), 4000);
  },
  error: (message: string) => {
    const id = String(++toastId);
    toasts = [...toasts, { id, message, type: "error" }];
    notify(listeners, toasts);
    setTimeout(() => toast.dismiss(id), 5000);
  },
  info: (message: string) => {
    const id = String(++toastId);
    toasts = [...toasts, { id, message, type: "info" }];
    notify(listeners, toasts);
    setTimeout(() => toast.dismiss(id), 4000);
  },
  dismiss: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify(listeners, toasts);
  },
};

export function useToast() {
  const [toastList, setToastList] = useState<Toast[]>([...toasts]);

  useEffect(() => {
    listeners.push(setToastList);
    return () => {
      const idx = listeners.indexOf(setToastList);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return { toasts: toastList, toast };
}

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-white min-w-72 max-w-96 ${
            t.type === "error"
              ? "bg-danger-500"
              : t.type === "success"
              ? "bg-primary-500"
              : "bg-info-500"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{t.message}</span>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-white/80 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
