# txt2blog

Message a Telegram bot whenever you like: text, photos, albums. Once a day, GitHub Actions turns everything you sent into a blog, one post per day, and publishes it to GitHub Pages.

- **No server.** The bot never runs as a process. GitHub Actions checks Telegram on a schedule and exits.
- **Your posts live in this repo.** Every message is saved under `content/` and committed by CI. That folder is the only database.
- **Create, edit, delete.** Send a message to post it, edit it in Telegram to update it, reply `/delete` to remove it.
- **Only you.** Messages from anyone other than `TELEGRAM_OWNER_ID` are ignored.
- **No JavaScript.** The site is plain HTML and one stylesheet.

## How it works

```
Telegram ──every 4h──▶ collect ──commit──▶ content/ ──daily──▶ build ──▶ GitHub Pages
         (getUpdates)                  messages/*.json         HTML + CSS
                                       media/*
```

Telegram bots can't read chat history. They only receive new messages, and Telegram holds them for just 24 hours. So the **collect** step runs every 4 hours and saves each message into `content/`. The **build** step reads only `content/`.

| File | Role |
| --- | --- |
| `src/cli.ts` | Entry point: `collect` or `build` |
| `src/telegram.ts` | Bot API client (`getUpdates`, file downloads) |
| `src/collect.ts` | Turns new messages, edits, and `/delete` replies into content files |
| `src/store.ts` | Reads and writes `content/` |
| `src/posts.ts` | Groups messages into days and albums |
| `src/text.ts` | Telegram formatting → escaped, safe HTML |
| `src/render.ts` | Page templates |
| `src/build.ts` | Writes the site to `dist/` |
| `static/style.css` | The only stylesheet |
| `.github/workflows/publish.yml` | Collect every 4 hours, publish daily |

## Setup

### 1. Create the bot

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and pick a name and username. It replies with a **token**.
2. Open a chat with your new bot and tap **Start**.
3. Find your user ID: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and find `"from":{"id":123456789,...}` on your `/start` message. Looking doesn't use up the message, and `/start` is never published.

### 2. Configure the repo

1. **Settings → Pages**: set **Source** to **GitHub Actions**.
2. **Settings → Secrets and variables → Actions**:
   - Secret `TELEGRAM_BOT_TOKEN`: the token.
   - Variable `TELEGRAM_OWNER_ID`: your user ID.
   - Optional variables: `BLOG_TITLE`, `BLOG_TIMEZONE`.
3. Push to `main`. The **Publish** workflow collects and publishes. You can also run it from **Actions → Publish → Run workflow**.

The same with the GitHub CLI (the first command prompts for the token):

```bash
gh secret set TELEGRAM_BOT_TOKEN
```

```bash
gh variable set TELEGRAM_OWNER_ID --body "123456789"
```

```bash
gh api -X POST repos/henryzlo/txt2blog/pages -f build_type=workflow
```

CI commits to `main`, so branch protection on `main` must let GitHub Actions push. Pages sites are public even when the repo is private (and Pages on a private repo needs a paid plan).

## Writing

- **Post:** send the bot text, photos, or albums. Everything sent on one calendar day (in `BLOG_TIMEZONE`) becomes one post. Telegram's formatting carries over: bold, italic, underline, strikethrough, spoilers, monospace, code blocks, quotes, and links.
- **Edit:** edit the message in Telegram.
- **Delete:** reply `/delete` to the message. Replying to any photo in an album removes the whole album. Deleting a message in Telegram does nothing, because Telegram doesn't tell bots about deletions. You can also delete its file from `content/messages/`.
- **When it appears:** at the next daily publish (09:17 UTC). Run the Publish workflow by hand to see it sooner.

### Limits

- **Text:** 4,096 characters per message, 1,024 for a photo caption. Send long text as its own message.
- **Photos:** sent normally, Telegram compresses them (to about 2560px), which suits a blog. Sent as a file, the original is kept up to 20 MB, the most a bot can download. Bigger files are skipped, but their caption is kept.
- **Only text and images are published.** Videos, voice notes, and stickers are skipped (captions are kept).
- **Collect must run at least every 24 hours** or messages are lost. GitHub pauses scheduled workflows in a public repo after 60 days without commits. If you go quiet that long, re-enable the workflow under **Actions** before posting again.
- **Deleted posts stay in git history,** and `content/` is as public as the repo.

## Configuration

| Variable | Used by | Default | Notes |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | collect | | Repository **secret**. |
| `TELEGRAM_OWNER_ID` | collect | | Your numeric user ID. |
| `BLOG_TITLE` | build | `hudjack blog` | Shown in the header and browser tab. |
| `BLOG_TIMEZONE` | build | `America/New_York` in CI, `UTC` locally | IANA zone used to split days. |
| `CONTENT_DIR` | both | `content` | |
| `OUT_DIR` | build | `dist` | Wiped on every build. |

## Development

Needs Node 22.18+ (it runs the TypeScript directly, with no build step).

```bash
npm ci
```

Build a sample site from `fixtures/content`, then open `dist/index.html`:

```bash
npm run preview
```

Pull your real messages into `content/` (needs `.env`; copy `.env.example`). This moves the update offset forward, so commit the result or CI won't see those messages:

```bash
npm run collect
```

Build the site from `content/`:

```bash
npm run build
```

Type-check and run the tests:

```bash
npm run check
```
