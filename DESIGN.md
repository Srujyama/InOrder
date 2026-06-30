# life — "Blueprint / Technical Atlas" design system

**One-sentence direction:** a draftsman's blueprint meets a transit map — every roadmap is
a line, topics are stations, prerequisites are the track, and a glowing marker shows your next stop.

Plain CSS custom properties, dark + light via `[data-theme]`. Built per the MediaVault design
guide's discipline: commit to one named aesthetic, distinctive fonts (never Inter/system-ui),
one hot accent, warm-cooled neutrals, real texture, mono technical detailing.

## Tokens (`src/styles.css` `:root` / `[data-theme='light']`)
- Surfaces: graphite-navy `--bg` `#0f1419` < `--surface` < `--surface-2` < `--surface-3`.
- Accent: electric cyan `--accent` `#2dd4d4` (per-track `--accent` overrides it).
- Priority `--p0..--p3` ink-tints; per-track accents are electrified (cyan/amber/azure/violet).
- Spacing: strict 4px grid `--s1..--s10`. Radii are **squared** `--r-xs:3 .. --r-xl:9` (editorial).
- Texture: blueprint grid + vignette on `body`; a film-grain `body::after` overlay.

## Type
- **Space Grotesk** — display + body (headings, titles, UI). Loaded via `<link>` in `index.html`.
- **IBM Plex Mono** (`--mono`) — all technical detailing: section labels (`// NEXT UP`),
  counts, percentages, due dates, badges, the login coordinate stamp.

## Signature details
- **Transit-map tree**: the roadmap spine is a route line; topic anchors are **station rings**
  (accent-stroked circles); connectors are clean rounded strokes.
- **Drafted gauges**: progress bars are squared with tick-marks behind the fill.
- **Spec-sheet dashboard cards**: dashed accent tick-strip header band, mono % + meta.
- **Blueprint login**: split-screen with a cyan blueprint grid, transit diagram, `THE LEARNING
  ATLAS` eyebrow, and a `LIFE.ATLAS · v1 · 00°00′N` coordinate stamp in the sheet margin.

## Rules followed (anti-slop)
- No Inter/Roboto/system-ui as primary type.
- One dominant dark surface + one hot accent; everything else muted.
- No flat backgrounds — grid + vignette + grain give drafted-stock texture.
- Every color is a token; no hardcoded `#fff` (would break light theme).
- One orchestrated entrance (connector draw-in, auth-rise); `prefers-reduced-motion` respected.

## Layout orientations
The roadmap renders as a clean directional tree, toggleable in the filter bar:
- **LR** (default): root topics on the left, children flow rightward, siblings stack.
- **TD**: topics across the top, children flow downward.
Subtree packing guarantees no overlap in either. Persisted in `localStorage` (`life-orientation`).
The old central-spine/left-right-split model was removed — it was the source of crossing-line clutter.

## Connectors
- **Parent→child**: confident accent curves to a station marker at the child's edge.
- **Dependencies (`requires`)**: deliberately recessive (faint dotted, opacity ~0.28); they
  spotlight to the accent color only when you hover the relevant node. Keeps the canvas calm.

## Themes (`src/themes.js` + token blocks in `styles.css`)
8 themes via a sidebar picker with live-preview swatches, persisted per user (`life-theme`),
applied pre-mount in `main.jsx` (no flash). A theme is just a `[data-theme]` token override:
Blueprint (default), Phosphor, Amber CRT, Plum, Crimson (dark); Drafting, Sepia, Mono (light).
Per-track accents come from data and persist across themes — themes reskin the chrome only.

## Anti-slop pass (no "lights")
Per the DesignCode "AI slop" critique, **all decorative glows were removed** — the tell the
critique hates most. No radial body vignettes, no blurred showcase glow, no breathing halo on
"next up", no progress-fill/marker glow, no diagram drop-shadow. Structure comes from **borders,
the grid, and crisp 0-blur rings only**. "Next up" reads via a solid 1px accent border + a faint
accent-tinted fill, not a halo. Texture (grain + grid) stays — it's drafted stock, not a light.
Uppercase mono eyebrows/labels were tightened from ~0.18em to ~0.1em tracking (avoid the
stretched-eyebrow tell). Kept: focus rings (a11y), the inset active-nav rail (structural).

## Anti-slop hardening (adversarial audit pass)
An adversarial multi-agent audit against the 4 core AI-slop mistakes found ~40 violations;
all were fixed:
1. **Selection states** — collapsed ~7 inconsistent "selected" languages into ONE accent idiom:
   surface controls use `surface-3 fill + inset 2px accent rail`; toolbar controls use
   `surface-3 + accent text`. Active now out-ranks hover (nav hierarchy was inverted).
2. **Eyebrows/labels** — replaced ~11 ad-hoc `letter-spacing` values with three tokens:
   `--track-caps` (0.1em), `--track-caps-tight` (0.08em, pills), `--track-mono` (0.03em).
   Off-grid magic margins (17px, 26px) are now `calc()` from real tokens.
3. **Pills** — one `--pill-pad` (2px 6px) on every badge/pill/chip (was 1px6/2px6/2px8/1px7).
4. **Lights** — `--shadow-pop` is now a flat `0 0 0 1px` hairline (was a 40px-blur drop shadow);
   removed `--shadow-hover`, all `--hi` bevels, the accent focus halo, the accent tick-strip
   gradient, the showcase accent-vignette + radial mask, and `filter:brightness` hovers. Deleted
   dead `--vignette-*`, `--accent-halo`, `--focus-ring` tokens. The pill-shaped toggle is squared.

Previous iterations ("Quiet Grid" matte; single vertical-spine layout) live in git history.
