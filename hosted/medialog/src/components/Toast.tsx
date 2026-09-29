import type React from 'react';
import { useEffect, useState } from 'react';

interface ToastState {
  id: number;
  message: string;
}

let toastListener: ((msg: string) => void) | null = null;

export function showToast(message: string) {
  if (toastListener) {
    toastListener(message);
  }
}

// Attach to window.mnui for platform spec compliance
if (typeof window !== 'undefined') {
  (window as any).mnui = (window as any).mnui || {};
  (window as any).mnui.toast = showToast;
}

export const ToastContainer: React.FC = () => {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    toastListener = (msg: string) => {
      const id = Date.now();
      setToast({ id, message: msg });
      setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 3200);
    };

    return () => {
      toastListener = null;
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="mn-toast show" role="status" aria-live="polite">
      {toast.message}
    </div>
  );
};
