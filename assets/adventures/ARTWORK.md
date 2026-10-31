# Adventure artwork and map

The adventure map is a single React Three Fiber scene with small wooden chips with bronze inlays on a textured table. Accessible HTML buttons are projected from the same world coordinates. A flat parchment map remains playable if WebGL or a texture fails. Everything is served locally; the game does not contact asset sites.

## Downloaded assets

| Files | Author / source | License | Treatment |
| --- | --- | --- | --- |
| `shared/engraving/*.svg` | Lucide contributors | ISC; license included in `shared/engraving/LICENSE-Lucide.txt` | Icons adapted with bronze inlay symbols with subtle offset highlights. |
| `shared/textures/wood-color.webp`, `wood-normal.webp` | Dimitrios Savva, [Wood Table / Poly Haven](https://polyhaven.com/a/wood_table) | [CC0](https://polyhaven.com/license) | 1K diffuse and OpenGL normal maps compressed to WebP. |
| `shared/props/iron_brazier/` | Taha Arslan, [Brazier 1 / ShareTextures](https://www.sharetextures.com/models/equipments/3d-brazier-1) | CC0 | FBX and 1K textures converted to glTF; embers and flames are added in the scene. |
| `shared/props/seadogs_compass/` | Benny Weimer, [Seadogs Compass / Poly Haven](https://polyhaven.com/a/seadogs_compass) | [CC0](https://polyhaven.com/license) | 1K glTF. |
| `shared/props/ornate_medieval_dagger/` | Sofia Pahaoja, [Ornate Medieval Dagger / Poly Haven](https://polyhaven.com/a/ornate_medieval_dagger) | [CC0](https://polyhaven.com/license) | 1K glTF. |
| `shared/props/brass_candleholders/`, `brass_goblets/` | Tina, [Brass Candleholders](https://polyhaven.com/a/brass_candleholders), [Brass Goblets](https://polyhaven.com/a/brass_goblets) / Poly Haven | [CC0](https://polyhaven.com/license) | Individual pieces arranged on the table; 1K glTF. |
| `shared/props/tavern/` | User-supplied `soiTavern_fbx` medieval interior pack | CC0, as supplied by user | Selected FBX meshes and their textures converted to compact glTF; the original pack remains in `soiTavern_fbx/`. |
| `shared/textures/fire-density.png` | [THREE.Fire by typeWolffo](https://github.com/typeWolffo/THREE.Fire) | MIT | Reference density texture for the volumetric brazier fire. |

The chips are layered procedural Three.js geometry using the shared wood texture. A subtle parchment shader adds fibres and worn shading. Room reflections use Three.js's bundled RoomEnvironment, with no HDR download. The metal inlays also use a stylized moving highlight, so they read at map scale. Torchlight and reflected highlights animate at a bounded rate while the map is visible; reduced motion and covered maps remain idle. Map textures, engravings and scene paintings are included in the normal startup preload; a loading cover fades away after the table's first rendered frame.

## Adventure paintings

Generated with the built-in imagegen tool, then compressed to WebP. The prompt set is recorded in [art-prompts.json](art-prompts.json).

- `bright-marches/art/story-*.webp`: nine 1600 × 900 paintings for Bosci's appointment, the appeal from Oakholmes, Maelin's ford, Odric, Gytha in Westhill, Draxus, Grendel, the council and Bosci's appointment as Warden. Each story node uses its own scene, expanded from the corresponding canonical card art to keep its characters and style consistent.

- `bright-marches/art/map.webp`: hand-inked Bright Marches map. Also used as the shared default `shared/textures/parchment.webp`.
- `bright-marches/art/seacliffe.webp`: adventure cover, departure and epilogue. Bosci's existing card artwork was the style / setting reference.
- `bright-marches/art/empty-hall.webp`, `burned-village.webp`, `oak-hall.webp`, `council.webp`: paintings for the feast, its aftermath, Oakholmes and the council.
- `bright-marches/art/fords.webp`: river wardens, ford meeting and river crossing scenes.
- `bright-marches/art/moor-storm.webp`: company sheltering on the moor.
- Remaining paintings reuse existing project artwork: `hill-farms.webp` from `assets/quest/art/village.webp`; `road-shrine.webp` from `shrine.webp`; `old-ally.webp` and `deserters.webp` from `encounter.webp`. Copies live here so removing the old quest assets cannot break adventures.

Battle introductions reuse the opponent faction's existing arena painting unless the enemy specifies its own `art`.

## Adding or replacing art

Put WebP images in `assets/adventures/<id>/art/`. In `adventure.json`, reference filenames without `.webp`:

- `art`: adventure selection painting.
- `mapArt`: flat portrait map texture, ideally 2:3, without route markers or text. The renderer overlays authored nodes and paths; painted geography is decorative.
- `events[].art`: story scene painting, ideally 16:9. Keep the bottom third quiet for story text.
- `events[].beats[].art`: optional painting for a particular beat; falls back to the event painting.
- `enemies[].art`: optional battle introduction painting; otherwise the faction arena is used.

The adventure importer copies these and `shared/` to generated `public/adventures/` for development and production builds. No manual downloads are required for the current implementation.
