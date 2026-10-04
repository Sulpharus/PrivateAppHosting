import { useEffect, useState } from 'react';

let listener: ((message: string) => void) | null = null;

/** Confirms a save, delete or failure for a few seconds. */
export function showToast(message: string): void {
  listener?.(message);
}

export function ToastContainer() {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    listener = (message) => {
      const id = Date.now();
      setToast({ id, message });
      clearTimeout(timer);
      timer = setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 3200);
    };
    return () => {
      listener = null;
      clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="mn-toast show" role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}
