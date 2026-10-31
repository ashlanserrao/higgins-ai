# "See how it works": the plan machine

An interactive isometric machine for the Higgins landing page. It is a framework-free web component, lazy-loaded, with a static poster for narrow screens. The app serves the built files from `frontend/public/hm/`; this folder is their source.

## Files

| Path | What it is |
|---|---|
| `../public/hm/loader.js` | The loader (0.9 KB gzipped). It defines `<higgins-how-it-works>`, shows the poster below 720 px wide, and otherwise imports the live machine when the section comes within 600 px of the viewport. Built from `src/loader.js`. |
| `../public/hm/machine.js` | The live machine, one ES module: markup and runtime. It links `machine.css` and inserts the art once that has loaded. Built by `build.mjs`. |
| `../public/hm/machine.css` | The machine's styles, shared by the live machine and the poster. Built by `build.mjs` from `src/machine.css`. |
| `../public/hm/poster.html` | The static poster: the finished state, frozen, with no script or styles of its own. The loader links `machine.css`, injects the poster into the shadow root and applies its `data-style` values, so it follows theme and accent like the live machine. Made by `make-posters.mjs`. |
| `../public/hm/poster-light.png`, `poster-dark.png` | PNG renders for the `<noscript>` fallback only. Made by `make-posters.mjs`. |
| `src/` | Sources: `model.mjs` (the example numbers), `machine-geometry.mjs` (all the parts), `variant-b.mjs` (the cabinet layout), `parts.mjs` (part builders), `runtime.js` (motion and input), `machine.css`, `loader.js`. |
| `kit/iso-kit.mjs`, `kit/lathe.mjs` | **Vendored** from the Anatomy skill's kit, unchanged: the isometric projection and solid builders that `src/parts.mjs` draws with. Used at build time only. |
| `tokens.example.css` | Stand-in tokens for the demo pages. The app maps `--hm-*` to its own tokens in `src/index.css`. |
| `demo/` | Written by the build, git-ignored: a host page with a placeholder hero and theme and accent switches, plus test pages that mount the machine without a shadow root. |

Build and preview, from `frontend/`:

```sh
npm run build:hm               # writes ../public/hm/loader.js, machine.js, machine.css and demo/
node how-it-works/serve.mjs    # http://localhost:8017/ (the demo host page)
```

**No inline styles anywhere**, so the app can send `style-src 'self'`: the CSS is a linked file, and what the runtime styles (coins, levels, the placeholder) it sets from script, which a CSP allows.

**The posters are committed artifacts.** `npm run build:hm` never touches `poster.html` or the PNGs. Regenerate them after changing the art or the example numbers. That needs the Anatomy skill's headless-browser driver (`drive.mjs` and `capture.mjs`), which is not in this repo:

```sh
node how-it-works/serve.mjs &   # the poster script drives the demo's test pages
ANATOMY_SCRIPTS=/path/to/anatomy/scripts node how-it-works/make-posters.mjs
```

## Where it's used

The landing hero (`src/features/landing/landing.tsx`) places the element and loads `/hm/loader.js` on that page only:

```html
<higgins-how-it-works src="/hm/machine.js" poster="/hm/poster.html" ratio="0.8600">
  <noscript><img src="/hm/poster-light.png" alt="…same text alternative…"></noscript>
</higgins-how-it-works>
```

`ratio` reserves the space (0.8600), so nothing below the section moves when the machine loads.

## Colour

The component reads eight inputs and derives every tone from them with `color-mix()`. No colour is typed inside the component.

`--hm-paper`, `--hm-surface`, `--hm-raised`, `--hm-shadow`, `--hm-ink`, `--hm-accent`, `--hm-highlight`, `--hm-brass` (plus `--hm-halo-strength` and `--hm-font`).

The mapping is declared on the `higgins-how-it-works` element itself (in `src/index.css`, and in `tokens.example.css` for the demo), not on `:root`. That way `--hm-accent` resolves under whichever `[data-event]` wraps it. Light and dark follow whatever the tokens do (`prefers-color-scheme` or `data-theme`). The machine is brass and ivory throughout. The event accent marks the outcome: the ticket's "Example" stamp, the plan card's band and the phone's "Send to family" button. Marigold (or gold for festivals) fills the coins and the tank levels.

## The layout

An upright cabinet with its front panels off, in three terraces read top to bottom. Card ratio about 0.86 : 1. Two chutes carry the coins: out to a turnaround box, then back along the tank shelf, so it reads as a marble run. The drum, tags and plan card sit in the bottom terrace, in front of the tanks, and the phone stands outside the cabinet. A run takes about 10 s. The calendar drum shows only the month (Dec or Aug), no year.

## Part count, load size, performance

- **Parts:** 152 shaded solids and about 1,440 paths. That counts bodies, slabs, discs and spheres; screws, ticks and rule lines are not counted. It is slightly over the ~150 target because of its walls and shelves.
- **Transfer size, gzipped:** the loader is 0.9 KB. The machine is 81 KB, fetched only on wider screens and only when near the viewport. The poster is 70 KB, fetched only on narrow screens. The PNGs (about 200 KB each) load only without JavaScript.
- **Rendering:** the static art is painted once into its own layer (`.hm-back`, `will-change: transform`). The moving parts, plus copies of the few static pieces that must cover them, live in a small overlay SVG. Each frame only repaints the overlay and writes a handful of attributes.
- **Measured** in headless Chrome on a desktop with software rasterization: script takes about 1 ms per frame (median; 2.6 ms at the 95th percentile), and runs hold 53–56 fps. Not yet profiled on a real phone; narrow screens get the static poster.
- **Pauses:** the loop stops when the run settles, when the section scrolls out of view and when the tab is hidden. It never loops on its own; it runs once when first seen and again when a lever is pulled.

## Accessibility

- Text alternative: a visually hidden description of the whole machine is linked with `aria-describedby`, and the drawing itself is `aria-hidden`.
- Parts: one tab stop, then the arrow keys (and Home or End) move between the ticket, hopper, chute, four tanks, drum, four book-by lanes, plan card and phone. Hover or focus shows a plain-language label, and each label is also the part's accessible name.
- Controls: the two levers and the reset button are real buttons. Enter or Space pulls them.
- After a pull, a polite live region says what changed, and later the new example in full. Numbers are never announced frame by frame.
- `prefers-reduced-motion`: the machine shows the finished state and changes instantly, with no motion.

## Changing the example values

Edit `EXAMPLE` in `src/model.mjs`, then run `npm run build:hm` and `make-posters.mjs` (the posters bake in the finished numbers). Every number on the ticket, tanks, card, phone, legend and labels comes from that one module.

- Budget, guests, step size and maximum: `budget`, `guests`, `guestStep`, `guestMax`. A pull past the maximum goes back to the starting count.
- The dates that "Move the date" toggles between: `dates`, with `busy: true` for wedding season.
- Split rules: `venueBase`, `venuePerGuest`, `venueQuietFactor`, `foodPerGuest` and `decor`. Other is whatever is left of the budget.
- Book-by lead times: `leads`. In the example, a busy month adds time for the venue and décor, every 25 extra guests add half a month for the venue, and every 50 add half a month for food. That is why each pull moves one or two tags.
- Coin value: `coinValue`, in lakh per coin.

**These are made-up example numbers**, labelled "Example" on the page. They are not the rules engine's pricing or logic (that lives in `app/engine/rules.py`).
