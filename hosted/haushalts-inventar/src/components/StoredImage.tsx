import { useEffect, useState } from 'react';
import { useApp } from '../lib/context';

// Signed URLs last an hour; the cache keeps one per path for 50 minutes.
const cache = new Map<string, { url: string; until: number }>();

/** A signed URL for a stored file, or null while it loads or when it cannot be read. */
export function useFileUrl(path: string | undefined): string | null {
  const { mn } = useApp();
  const [url, setUrl] = useState<string | null>(() =>
    path ? (cache.get(path)?.url ?? null) : null,
  );
  useEffect(() => {
    if (!path || !mn) {
      setUrl(null);
      return;
    }
    const hit = cache.get(path);
    if (hit && hit.until > Date.now()) {
      setUrl(hit.url);
      return;
    }
    let cancelled = false;
    mn.files
      .url(path)
      .then((signed) => {
        cache.set(path, { url: signed, until: Date.now() + 50 * 60 * 1000 });
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path, mn]);
  return url;
}

/** Looks the file up; the picture is decorative because the title next to it names the item. */
export function StoredImage({ path, className }: { path: string | undefined; className?: string }) {
  const url = useFileUrl(path);
  if (!url) return null;
  return <img src={url} alt="" className={className} loading="lazy" />;
}
