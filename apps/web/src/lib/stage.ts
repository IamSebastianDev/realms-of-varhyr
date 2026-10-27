import { getPreferences, subscribePreferences, type Screen } from "@realms/ui/preferences";
import { setStageGeometry } from "@realms/ui/stage";

/**
 * The game is one desktop layout drawn on a stage of fixed height; the stage's width follows the chosen aspect.
 * The stage is scaled uniformly to fit the window and centred on black, so a different window or screen changes only the scale.
 */
export const STAGE_HEIGHT = 900;
const aspects: Record<Exclude<Screen, "auto">, number> = {
  "16:9": 16 / 9,
  "16:10": 16 / 10,
  "4:3": 4 / 3,
  "21:9": 21 / 9,
};
/** The widest and narrowest shapes "auto" follows; a window beyond them gets black bars. */
const AUTO_MIN = 4 / 3;
const AUTO_MAX = 21 / 9;

export function stageSize(screen: Screen, availableWidth: number, availableHeight: number) {
  const aspect =
    screen === "auto"
      ? Math.min(AUTO_MAX, Math.max(AUTO_MIN, availableWidth / availableHeight))
      : aspects[screen];
  const width = Math.round(STAGE_HEIGHT * aspect);
  const scale = Math.min(availableWidth / width, availableHeight / STAGE_HEIGHT);
  return { width, height: STAGE_HEIGHT, scale };
}
/** Stage size in pixels for the settings list. */
export const stageLabel = (screen: Exclude<Screen, "auto">) =>
  `${Math.round(STAGE_HEIGHT * aspects[screen])}×${STAGE_HEIGHT}`;

/** Sizes #stage inside #stage-frame (the safe area of the window) and keeps it fitted. */
export function installStage() {
  const frame = document.getElementById("stage-frame"),
    stage = document.getElementById("stage");
  if (!frame || !stage) return;
  const apply = () => {
    const box = frame.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const { width, height, scale } = stageSize(getPreferences().screen, box.width, box.height);
    const x = (box.width - width * scale) / 2,
      y = (box.height - height * scale) / 2;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    document.documentElement.style.setProperty("--ui-scale", scale.toFixed(3));
    setStageGeometry({ scale, left: box.left + x, top: box.top + y, width, height });
  };
  apply();
  window.addEventListener("resize", apply);
  window.visualViewport?.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  subscribePreferences(apply);
}
