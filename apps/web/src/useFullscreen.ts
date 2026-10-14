import { useCallback, useEffect, useState } from 'react';

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const current = () => { const doc = document as FullscreenDocument; return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement); };
/** Installed to the home screen (or launched as an app): the browser chrome is already gone. */
const installed = () => {
  try { return window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; }
  catch { return false; }
};

/** Browser fullscreen where the platform allows it (desktop, iPad Safari). iPhone Safari has no such API; there the
 * page can only go chrome-free once it is added to the home screen, which `installed` detects. */
export function useFullscreen() {
  const doc = document as FullscreenDocument;
  const supported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const [active, setActive] = useState(current);
  useEffect(() => {
    const sync = () => setActive(current());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
  }, []);
  const toggle = useCallback(async () => {
    try {
      if (current()) await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      else { const root = document.documentElement as FullscreenElement; await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.()); }
    } catch { /* The browser refused; the button simply stays as it was. */ }
  }, [doc]);
  return { supported, active, installed: installed(), toggle };
}
