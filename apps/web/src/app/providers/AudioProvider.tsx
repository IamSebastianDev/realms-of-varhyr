import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, Volume2 } from "lucide-react";
import { BurnEmbers } from "../../features/match/components/BurnEmbers";
/** Every mp3 in assets/audio joins the shuffle. */
const soundtrack = Object.values(
  import.meta.glob<string>("../../../../../assets/audio/*.mp3", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
import { AudioController } from "../../features/audio/audioController";
import type { BedName } from "../../features/audio/catalog";
/** Recorded effects and beds, by file name. Missing files fall back to the synthesised stand-ins in audio/catalog.ts. */
/** `card.play.1.ogg`, `card.play.2.ogg`: every file of one name is a variation, and one is chosen at random each time. */
const byName = (files: Record<string, string>) => {
  const named: Record<string, string[]> = {};
  for (const [path, url] of Object.entries(files))
    (named[
      path
        .split("/")
        .pop()!
        .replace(/\.[^.]+$/, "")
        .replace(/[.-]\d+$/, "")
    ] ??= []).push(url);
  return named;
};
const recordedEffects = byName(
  import.meta.glob<string>("../../../../../assets/sfx/*.{mp3,ogg,wav}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
export const audioUrls = { effects: recordedEffects, music: soundtrack };
const recordedBeds = byName(
  import.meta.glob<string>("../../../../../assets/ambience/*.{mp3,ogg,wav}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
import { getPreferences, subscribePreferences, usePreferences } from "@realms/ui/preferences";
import { t as msg, useLanguage } from "@realms/ui/i18n";
const audioContext = createContext({
  playEffect: (_type: string) => {},
  setAmbience: (_bed: BedName | null) => {},
  retry: () => {},
  blocked: false,
});
export const useAudio = () => useContext(audioContext);
export function AudioProvider({ children }: { children: ReactNode }) {
  useLanguage();
  const preferences = usePreferences();
  const track = useRef<HTMLAudioElement>(null),
    controller = useRef<AudioController | null>(null);
  const [entered, setEntered] = useState(false),
    [blocked, setBlocked] = useState(false);
  const enterButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const player = new AudioController(
      track.current!,
      soundtrack,
      getPreferences(),
      undefined,
      setBlocked,
      { effects: recordedEffects, ambience: recordedBeds },
    );
    controller.current = player;
    const visibility = () => player.setHidden(document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const unsubscribe = subscribePreferences(() => player.configure(getPreferences()));
    const click = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        "button,[role=tab],[role=switch],a[href]",
      ) as HTMLElement | null;
      if (
        !target ||
        target.matches(":disabled,[aria-disabled=true]") ||
        target.closest("[data-silent]")
      )
        return;
      player.playEffect(target.getAttribute("role") === "tab" ? "ui.tab" : "ui.click");
    };
    document.addEventListener("click", click, true);
    enterButton.current?.focus();
    return () => {
      document.removeEventListener("click", click, true);
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      player.dispose();
      controller.current = null;
    };
  }, []);
  const playEffect = useCallback((type: string) => controller.current?.playEffect(type), []);
  const setAmbience = useCallback(
    (bed: BedName | null) => controller.current?.setAmbience(bed),
    [],
  );
  const retry = useCallback(() => controller.current?.unlock(), []);
  function enter() {
    controller.current?.unlock();
    setEntered(true);
  }
  return (
    <audioContext.Provider value={{ playEffect, setAmbience, retry, blocked }}>
      <audio ref={track} preload="none" hidden />
      <div inert={!entered} aria-hidden={!entered || undefined}>
        {children}
      </div>
      {!entered && (
        <section
          className="realm-splash"
          role="dialog"
          aria-modal="true"
          aria-label={msg("Welcome to Realms of Varhyr")}
        >
          <div className="splash-horizon" aria-hidden="true" />
          <div className="splash-sigil" aria-hidden="true">
            <span>V</span>
          </div>
          <div className="splash-content">
            <p className="splash-kicker">REALMS OF</p>
            <h1>VARHYR</h1>
            <div className="splash-divider" aria-hidden="true">
              ✦
            </div>
            <p className="splash-story">{msg("Your next story begins here.")}</p>
            <button
              ref={enterButton}
              className="gold-button start-play splash-play"
              data-autofocus="true"
              onKeyDown={(event) => {
                event.currentTarget.removeAttribute("data-autofocus");
              }}
              onClick={enter}
            >
              <BurnEmbers />
              <span>{msg("Enter the realm")}</span>
              <ArrowRight size={21} />
            </button>
            <p className="splash-audio">
              {(preferences.music || preferences.sound) && (
                <>
                  <Volume2 size={13} />
                  {msg("Enter with sound")}
                  <span>·</span>
                </>
              )}
              {msg("Music and sound can be adjusted in Settings.")}
            </p>
          </div>
        </section>
      )}
    </audioContext.Provider>
  );
}
