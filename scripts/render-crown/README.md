# Crown coin

`public/crown/crown.webp` is the render (192px) of a render of the 3D crown coin. `scene.js` (three.js, RoomEnvironment lighting) renders a 48-frame turntable sheet: bundle it with esbuild, load it in headless Chromium with SwiftShader, call `window.renderSheet()` and cut the first cell.

## Silver coin

`public/crown/silver.webp` is the expedition's coin, rendered the same way from `silver.js` (silver materials, a crescent and a star instead of the crown). Bundle `silver.js` with esbuild, call `window.renderSheet()` in headless Chromium and save the 192px result as WebP.
