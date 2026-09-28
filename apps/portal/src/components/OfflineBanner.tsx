import { useEffect, useState } from 'react';

/** Shown while the device is offline: the portal then works from its caches (PWA). */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (online) return null;
  return (
    <p className="offline-banner" role="status">
      Offline: du siehst den zuletzt geladenen Stand. Apps, die offline funktionieren, öffnen
      trotzdem.
    </p>
  );
}
