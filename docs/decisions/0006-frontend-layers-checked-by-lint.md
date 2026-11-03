# 0006: Frontend layers, checked by the linter

**Status:** Accepted, 3 Nov 2026

## Context
The frontend was already split into `pages/`, `features/`, `components/` and `state/`, but `lib/`
held 16 flat files of five different kinds: the API client and its generated types, browser
storage, plan helpers, React hooks and formatting (with display labels mixed in). Nothing stopped
a low-level module from importing a feature, and the backend's layer rule (0005) was only written
down, not checked.

## Decision
- `lib/api/` (client, generated types, named types), `lib/storage/` (safe storage, saved events,
  accounts, share links), and a top-level `hooks/` for generic hooks. Display labels move from
  `format.ts` to `labels.ts`.
- One stack: `pages → features → components → state → hooks → lib`. Shared code lives below
  everything that uses it; code one feature uses stays in that feature.
- Biome's `noRestrictedImports`, one override per layer, makes `npm run lint` fail on an upward
  import. `../` imports are banned in `src/` so a relative path can't step around it; across
  folders, files import through `@/`.
- No barrel files (`index.ts` re-exports): an import names the file it comes from.
- No behaviour change: tests unchanged and passing, the same build chunks at the same sizes, e2e
  green.

## Consequences
- An upward import is a lint error with a message that names the rule, not a review comment.
- Biome can't merge options between overrides, so the `../` pattern is repeated in each layer's
  override.
- The generated types now live at `lib/api/generated.ts`; `npm run gen:types` writes there.
