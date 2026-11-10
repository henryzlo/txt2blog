# txt2blog

A Telegram bot that only exists in CI. `.github/workflows/publish.yml` runs `collect` every 4 hours (Telegram updates → files in `content/`, committed to `main`) and, once a day, `build` + deploy (`content/` → static HTML/CSS on GitHub Pages). See README.md for setup.

## Commands

- `npm run check`: type-check (`tsc`) + tests (`node --test`). Run this before calling a change done.
- `npm run preview`: build `dist/` from `fixtures/content` with no network. Use it to look at template/CSS changes (open `dist/index.html`).
- `npm run collect` / `npm run build`: the two CI steps. `collect` needs `.env` and advances the real Telegram offset; don't run it casually.

## Design rules

- **`content/` is the database.** Telegram bots can't read history and Telegram drops undelivered updates after 24 hours, so everything must be persisted at collect time. `build` reads only `content/` and never touches the network.
- **Offset safety.** Requesting `getUpdates` with an offset makes Telegram drop earlier updates. The offset lives in `content/state.json` and is committed with the content; `collect` doesn't request past the last page it got, so that page is only confirmed by the next run.
- **Edits overwrite, deletes are explicit.** `edited_message` rewrites the entry. Telegram sends nothing when a message is deleted, so deletion is a `/delete` reply (whole album if the target is in one); deleted IDs are kept in `state.json` so later edits don't resurrect them.
- **Owner-only.** `isFromOwner` in `src/collect.ts` (private chat + `from.id`) is the single gate on what gets stored.
- **No JavaScript in the output.** No `<script>`, inline handlers, or JS-dependent features. Interactivity is CSS-only (see `.spoiler`).
- **All message text goes through `renderText` in `src/text.ts`**, which renders Telegram entities (UTF-16 offsets) and escapes everything else. Only `http(s)` URLs become links. Never interpolate stored strings into HTML without `escapeHtml`.
- **Media names are validated** (`isSafeMediaName`) before touching the filesystem. SVG uploads are not accepted.
- **Relative links only**, so the site works under a Pages project path and from disk. The home page uses root `""`, post pages use `"../"`.

## Code conventions

- Node ≥22.18 runs `.ts` files directly via type stripping; there is no compile step. Only erasable TypeScript syntax is allowed (no `enum`, `namespace`, or constructor parameter properties), and relative imports use the `.ts` extension. `tsconfig.json` enforces both.
- No runtime dependencies: use `fetch`, `node:fs`, and `Intl`. Dev dependencies are `typescript` and `@types/node` only.
- Tests use `node:test` + `node:assert/strict` and live in `test/*.test.ts`. Network code takes an injectable `fetchFn` or a fake `TelegramClient`; tests never hit the network. Never log or throw a Bot API URL: it contains the token.
