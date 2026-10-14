# @varhyr/ui

Presentation code shared by the game (`apps/web`) and the card studio (`apps/studio`).

- `CardPresentation.tsx` — `ArtCard`, `CardFace`, `CardFacts`, costs and energy output.
- `CardDetail.tsx` — the card detail and hover preview.
- `i18n/` — English/German translation (`de.json`), `t()`, `localizedCard()`, `ApplicationPreferences`.
- `preferences.ts` — language, motion and sound preferences, persisted in localStorage.
- `card.css` — every style a card needs. It is imported by `CardPresentation`, so an app only has to import `fonts.ts` once.

Rules of thumb: anything about how a card looks belongs here; anything about the board, lobby, collection or deck builder stays in `apps/web`. Context styles such as `.collection-card-grid .art-card` stay with the app that owns the context and must load after `card.css`.
