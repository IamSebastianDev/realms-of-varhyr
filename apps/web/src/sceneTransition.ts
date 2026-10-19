import { flushSync } from 'react-dom';

/** Runs a scene change inside a View Transition (black crossfade, see scene-transition.css). */
export function sceneTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  let reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  if (!doc.startViewTransition || reduced) { update(); return; }
  try { doc.startViewTransition(() => { flushSync(update); }); } catch { update(); }
}
