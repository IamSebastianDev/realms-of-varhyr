# Deploying the game

The game is a static single-page app. Multiplayer runs peer to peer over WebRTC (PeerJS), so there is no game server to host.

## Cloudflare (Workers static assets)

`apps/web/wrangler.toml` points Cloudflare at `apps/web/dist/`. Connect the GitHub repository (Workers Builds) and use:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --config apps/web/wrangler.toml` |
| Node version | 22.18 or newer (set `NODE_VERSION` if the default is older) |

`npm run build` regenerates the card catalogue from `assets/` first, then type-checks and bundles.

Cloudflare Pages also works: skip `wrangler.toml` and set the build output directory to `apps/web/dist`.

The card studio (`apps/studio`) edits a local folder and is not deployed.

## Card art in production

Authoring stays PNG: every card needs `assets/cards/<id>/data.png`. Only the production build converts the art to WebP
(`tools/src/webp-art-plugin.ts`, quality 82) and points the catalogue and stylesheets at the `.webp` files. Dev mode,
`public/cards` and the importer keep using the PNGs. Expect roughly a tenth of the original size.

`public/_headers` caches card art and bundles for a year. Card art URLs carry a content hash, so edits are picked up.

## Multiplayer notes

PeerJS uses its free public broker by default; it is shared and best-effort. Some strict networks need a TURN relay to
connect two players. If connections fail for testers, that is the first thing to check.
