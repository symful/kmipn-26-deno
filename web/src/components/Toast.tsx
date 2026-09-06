import { useState, useCallback, useEffect } from "react";
import { sidebarColors } from "../theme/tokens";

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

  if ((toasts?.length ?? 0) === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-3 shadow-lg text-white min-w-72 max-w-96"
          style={{
            backgroundColor: sidebarColors.sidebarBg,
            borderRadius: 9,
            fontSize: 12,
            padding: "13px 22px",
          }}
        >
          <span>{t.message}</span>
          <button
            onClick={() => toast.dismiss(t.id)}
            aria-label="Tutup notifikasi"
            className="text-white/80 hover:text-white text-lg leading-none min-h-11 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none rounded"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
