import { type RefObject, useEffect, useRef, useState } from 'react';
import { useSdk } from '../lib/context';

// Signed URLs last an hour; the cache keeps one per path for 50 minutes.
const cache = new Map<string, { url: string; until: number }>();
const fresh = (path: string): string | null => {
  const hit = cache.get(path);
  return hit && hit.until > Date.now() ? hit.url : null;
};

/** True once the element has come within 300 px of the screen (and stays true). */
function useNearScreen(ref: RefObject<Element | null>, disabled: boolean): boolean {
  const [near, setNear] = useState(disabled);
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

/**
 * A signed URL for a stored file, or null while it loads or when it cannot be read. With `lazy`
 * the request waits until `ref` is near the screen, so a long list asks for the pictures that
 * can be seen, not for all of them at once.
 */
export function useFileUrl(
  path: string | undefined,
  ref?: RefObject<Element | null>,
): string | null {
  const mn = useSdk();
  const fallback = useRef<Element | null>(null);
  const near = useNearScreen(ref ?? fallback, !ref);
  const [url, setUrl] = useState<string | null>(() => (path ? fresh(path) : null));
  useEffect(() => {
    if (!path || !mn || !near) {
      if (!path) setUrl(null);
      return;
    }
    const hit = fresh(path);
    if (hit) {
      setUrl(hit);
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
  }, [path, mn, near]);
  return url;
}

/** A picture of a stored file; it is decorative because the title next to it names the item. */
export function StoredImage({ path, className }: { path: string | undefined; className?: string }) {
  const holder = useRef<HTMLSpanElement>(null);
  const url = useFileUrl(path, holder);
  return (
    <span ref={holder} className="hi-img">
      {url && <img src={url} alt="" className={className} loading="lazy" decoding="async" />}
    </span>
  );
}
