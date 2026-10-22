import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PhaseAdvanceInput, type PhaseAdvanceContext } from "./phaseAdvance";

/** Shared by the global shortcut and the focused main button; other controls retain native Space. */
export function usePhaseAdvance(context: PhaseAdvanceContext, advance: () => void) {
  const action = useRef(advance);
  action.current = advance;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [transitionStartedAt, setTransitionStartedAt] = useState<number | null>(null);
  const [input] = useState(
    () => new PhaseAdvanceInput(() => action.current(), setTransitionStartedAt),
  );
  useLayoutEffect(() => input.update(context), [input, context.phaseKey, context.enabled]);
  useEffect(() => {
    function allowed(target: EventTarget | null) {
      if (!(target instanceof Element)) return true;
      if (target.closest("button") === buttonRef.current && buttonRef.current) return true;
      return (
        !(target as HTMLElement).isContentEditable &&
        !target.closest(
          'input,textarea,select,button,a,[role="dialog"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="button"]',
        )
      );
    }
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        event.defaultPrevented ||
        !allowed(event.target)
      )
        return;
      if (event.repeat) {
        if (input.spaceDown || event.target === buttonRef.current) event.preventDefault();
        return;
      }
      if (input.pressSpace()) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" && input.releaseSpace()) event.preventDefault();
    };
    const blur = () => input.releaseSpace();
    const visibility = () => {
      if (document.hidden) input.releaseSpace();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      input.dispose();
    };
  }, [input]);
  return { buttonRef, transitionStartedAt, click: () => input.click() };
}
