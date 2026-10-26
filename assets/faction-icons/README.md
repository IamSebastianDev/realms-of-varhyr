# Faction emblems

Each faction has an SVG named `<faction-id>.svg`. These files are the UI source of truth; matching files are discovered automatically. Add a matching SVG when adding a faction.

Use an etched fantasy style: tapered edges, angular forms and generous open space. Author the strokes as filled path outlines in a 24 × 24 viewBox, with `fill="currentColor"` and `fill-rule="evenodd"`. Keep a 2-unit outer margin. Use path geometry only; the renderer reads path data and never inserts raw SVG markup. Avoid decorative frames, hairlines, gradients and miniature details. Keep the body of each stroke around 1.5–2 units thick so it survives at 14–20px; only its tips should taper to a point.

- Crownlands: open, pointed crown.
- Northern League: an outlined lighthouse with two beams and a base line.
- Bright Marches: spear-mounted, windswept banner.
- Mountain Clans: etched peaks and a stone baseline.
- Conclave: branching forest sprig.
- Ember Fields: three curling flame strokes.
- Horde: three curved claw cuts.
- Black Host: angular hood and an outlined skull.
- Neutral: outlined waystone with a cleft. Generic energy costs use a plain hollow diamond.

While the development server is running, open `/.faction-icon-preview.html` to review the whole family in color, monochrome and at its actual energy size. The preview uses the same SVG renderer and energy component as the game.
