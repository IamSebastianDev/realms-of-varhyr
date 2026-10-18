/**
 * One global scale for phones. The app is laid out for a window at least DESIGN_HEIGHT css pixels tall; a phone held
 * sideways is only ~390 tall, so its viewport is widened (meta viewport) until the height matches. The browser then
 * shrinks the whole page uniformly, so every px, vh, vw and pointer coordinate stays consistent without per-screen rules.
 * Phones in portrait are not supported: the page asks to be turned.
 */
export const DESIGN_HEIGHT = 560;

const phone = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) <= 600;

export function applyUiScale() {
  const root = document.documentElement, meta = document.querySelector('meta[name=viewport]');
  if (!meta) return;
  const isPhone = phone();
  const short = Math.min(window.screen.width, window.screen.height), long = Math.max(window.screen.width, window.screen.height);
  const portrait = isPhone && window.matchMedia('(orientation: portrait)').matches;
  root.dataset.phone = isPhone ? 'true' : 'false'; root.dataset.portrait = portrait ? 'true' : 'false';
  const scale = isPhone && !portrait ? Math.min(1, short / DESIGN_HEIGHT) : 1;
  root.style.setProperty('--ui-scale', scale.toFixed(3));
  const content = isPhone && !portrait ? `width=${Math.round(long / scale)}, viewport-fit=cover` : 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  if (meta.getAttribute('content') !== content) meta.setAttribute('content', content);
}

export function watchUiScale() {
  applyUiScale();
  window.addEventListener('resize', applyUiScale);
  window.addEventListener('orientationchange', applyUiScale);
}
