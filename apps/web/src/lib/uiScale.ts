/**
 * Phones: the game is played sideways. The page itself is always device-width; the stage (stage.ts) does all the scaling
 * and publishes --ui-scale, so touch targets can be sized in real pixels. A phone held upright asks to be turned.
 */
const phone = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches &&
  Math.min(window.screen.width, window.screen.height) <= 600;

export function applyUiScale() {
  const root = document.documentElement;
  const isPhone = phone();
  const portrait = isPhone && window.matchMedia("(orientation: portrait)").matches;
  root.dataset.phone = isPhone ? "true" : "false";
  root.dataset.portrait = portrait ? "true" : "false";
}

export function watchUiScale() {
  applyUiScale();
  window.addEventListener("resize", applyUiScale);
  window.addEventListener("orientationchange", applyUiScale);
}
