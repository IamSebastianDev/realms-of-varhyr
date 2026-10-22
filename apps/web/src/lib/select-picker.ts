/** A native select popup consumes the first Escape before a surrounding drawer/dialog.
 * Don't prevent the browser's default: it still needs to dismiss the picker itself. */
if (CSS.supports("appearance", "base-select")) {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !(event.target instanceof Element)) return;
      const select = event.target.closest("select");
      if (select?.matches(":open")) event.stopPropagation();
    },
    { capture: true },
  );
}
