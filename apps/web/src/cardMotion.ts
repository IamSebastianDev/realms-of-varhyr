import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PlayerId } from '../../../packages/contracts/src';
import type { SlotLayout } from '../../../packages/renderer/src/Board';
import type { ClashStep, PoseSpec } from './combatReplay';

/** Where a real card is, relative to its resting place, while a fight is replayed. Pixels, degrees and 0..1 opacity. */
export type Pose = { x: number; y: number; s: number; rot: number; alpha: number; lift: boolean };
export type Poses = Record<string, Pose>;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const out = (p: number) => 1 - (1 - p) ** 3;

/** How far a striking card travels: most of the way to a card, about a card's height towards a player. */
export function lungeVector(spec: Pick<PoseSpec, 'player' | 'slot' | 'toward'>, slots: SlotLayout[], viewer: PlayerId): [number, number] {
  const from = slots.find(s => s.player === spec.player && s.slot === spec.slot);
  if (!from || !spec.toward) return [0, 0];
  if ('life' in spec.toward) return [0, (spec.player === viewer ? -1 : 1) * from.height * .92];
  const toward = spec.toward, to = slots.find(s => s.player === toward.player && s.slot === toward.slot);
  return to ? [(to.x + to.width / 2 - from.x - from.width / 2) * .64, (to.y + to.height / 2 - from.y - from.height / 2) * .64] : [0, 0];
}

export function poseAt(spec: PoseSpec, t: number, ms: number, [vx, vy]: [number, number]): Pose {
  const rest: Pose = { x: 0, y: 0, s: 1, rot: 0, alpha: 1, lift: false };
  switch (spec.mode) {
    case 'lunge': {
      const p = clamp(t / ms);
      // A short pull back, then a hard drive at the target.
      const along = p < .34 ? -.07 * out(p / .34) : -.07 + 1.07 * ((p - .34) / .66) ** 2.2;
      return { ...rest, x: vx * along, y: vy * along, s: 1 + .04 * clamp(along + .07), lift: true };
    }
    case 'strike': {
      const u = clamp(t / 520);
      return { ...rest, x: vx, y: vy, s: 1.04 + .07 * (1 - out(u)), rot: 1.4 * Math.sin(u * 18) * (1 - u), lift: true };
    }
    case 'return': {
      const u = out(clamp(t / ms));
      return { ...rest, x: vx * (1 - u), y: vy * (1 - u), s: 1.04 - .04 * u, lift: u < 1 };
    }
    case 'hit': {
      const u = clamp(t / 620);
      return { ...rest, x: Math.sin(u * 30) * 10 * (1 - u) ** 2 };
    }
    case 'die': {
      const u = clamp(t / ms), fade = clamp((u - .5) / .5), base = spec.lunged ? 1.04 : 1;
      return { x: (spec.lunged ? vx : 0) + (u < .28 ? Math.sin(u * 50) * 7 * (1 - u / .28) : 0), y: (spec.lunged ? vy : 0) + 12 * fade, s: base * (1 - .14 * fade), rot: 2.5 * fade, alpha: 1 - fade, lift: !!spec.lunged };
    }
    case 'arrive': {
      const u = out(clamp(t / ms));
      return { ...rest, s: .94 + .06 * u, alpha: .55 + .45 * u };
    }
  }
}

const overlays = (player: PlayerId, slot: number) => [
  document.querySelector<HTMLElement>(`[data-battlefield-slot="${player}-${slot}"]`),
  document.querySelector<HTMLElement>(`.flat-slot[data-player="${player}"][data-slot="${slot}"]`),
].filter((el): el is HTMLElement => !!el);
type Style = { transform: string; opacity: string; zIndex: string };
const touched = new Set<HTMLElement>();
const clear = (el: HTMLElement) => { el.style.transform = el.style.opacity = el.style.zIndex = ''; };
/** Paint one frame: whatever is not in `frame` goes back to rest. */
function paint(frame: Map<HTMLElement, Style>) {
  for (const [el, style] of frame) { el.style.transform = style.transform; el.style.opacity = style.opacity; el.style.zIndex = style.zIndex; touched.add(el); }
  for (const el of touched) if (!frame.has(el)) { clear(el); touched.delete(el); }
}
const styleOf = (pose: Pose): Style => ({
  transform: `translate(${pose.x}px,${pose.y}px) scale(${pose.s}) rotate(${pose.rot}deg)`,
  opacity: pose.alpha < 1 ? String(pose.alpha) : '', zIndex: pose.lift ? '30' : '',
});

/**
 * Drives the real cards of the current step. The same pose moves the card's text face (DOM) and, through `poses`, its
 * 3D body, so there is one card on screen, not a copy standing in for it. A card a striker is standing on has its text
 * face hidden, because the page draws every face above the 3D bodies.
 */
export function useCardMotion(step: ClashStep | null, slots: SlotLayout[], viewer: PlayerId, poses: MutableRefObject<Poses>) {
  const layout = useRef(slots);
  layout.current = slots;
  useEffect(() => {
    if (!step) return;
    const t0 = performance.now(), specs = step.poses.map(spec => ({ spec, vec: lungeVector(spec, layout.current, viewer) }));
    let frame = 0;
    const tick = () => {
      const t = performance.now() - t0, next: Poses = {}, styles = new Map<HTMLElement, Style>();
      for (const { spec, vec } of specs) {
        const pose = poseAt(spec, t, step.ms, vec);
        next[spec.id] = pose;
        for (const el of overlays(spec.player, spec.slot)) styles.set(el, styleOf(pose));
      }
      for (const { spec, vec } of specs) {
        const pose = next[spec.id], total = Math.hypot(vec[0], vec[1]);
        if (spec.toward && !('life' in spec.toward) && total > 0 && Math.hypot(pose.x, pose.y) > .7 * total && ['lunge', 'strike', 'return'].includes(spec.mode)) {
          for (const el of overlays(spec.toward.player, spec.toward.slot)) styles.set(el, { ...(styles.get(el) ?? { transform: '', zIndex: '' }), opacity: '0' } as Style);
        }
      }
      poses.current = next;
      paint(styles);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, viewer, poses]);
  // When the replay ends, hand every card back to the board.
  useEffect(() => {
    if (step) return;
    poses.current = {};
    paint(new Map());
  }, [step, poses]);
}
