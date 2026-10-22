import { useEffect, useRef, useState } from "react";

/** Optional motion belongs to presentation; card rules only carry asset paths. */
export function CardArtwork({
  art,
  animation,
  alt = "",
  playing = false,
  reduced,
}: {
  art: string;
  animation?: string;
  alt?: string;
  playing?: boolean;
  reduced?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const active = playing && !(reduced ?? systemReduced) && !failed;
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReduced(preference.matches);
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [animation]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active)
      void element.play().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    else {
      element.pause();
      if (element.readyState > 0) element.currentTime = 0;
    }
    return () => element.pause();
  }, [active, animation]);
  return (
    <>
      <img src={art} alt={alt} />
      {animation && (
        <video
          ref={video}
          src={animation}
          poster={art}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          className="animated-artwork"
          data-playing={active && ready}
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
          style={{ opacity: active && ready ? 1 : 0 }}
        />
      )}
    </>
  );
}
