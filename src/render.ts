import type { Item, Post } from "./posts.ts";
import type { Image } from "./store.ts";
import { escapeHtml, renderText } from "./text.ts";

// Pages are plain HTML + one stylesheet. No JavaScript, ever.
// All links are relative so the site works under any base path
// (e.g. a GitHub Pages project site) and straight from disk.

export type SiteOptions = {
  title: string;
  timeZone: string;
};

/** How many of the latest days the home page shows in full. */
export const RECENT_POSTS = 10;

export function postPath(date: string): string {
  return `posts/${date}.html`;
}

export function renderIndex(posts: Post[], site: SiteOptions): string {
  const recent = posts.slice(0, RECENT_POSTS);
  const earlier = posts.slice(RECENT_POSTS);

  const body =
    posts.length === 0
      ? `<p class="empty">Nothing here yet.</p>`
      : [
          ...recent.map((post) => renderDay(post, site, "", 2)),
          earlier.length ? renderArchive(earlier) : "",
        ].join("\n");

  return layout({ site, root: "", body });
}

export function renderPostPage(
  post: Post,
  site: SiteOptions,
  newer: Post | undefined,
  older: Post | undefined,
): string {
  const pager = [
    newer ? `<a class="newer" href="${newer.date}.html">← ${formatDay(newer.date)}</a>` : "",
    older ? `<a class="older" href="${older.date}.html">${formatDay(older.date)} →</a>` : "",
  ].join("");

  const body = `${renderDay(post, site, "../", 1)}
<nav class="pager">${pager}</nav>`;

  return layout({ site, root: "../", title: formatDay(post.date), body });
}

function renderDay(post: Post, site: SiteOptions, root: string, level: 1 | 2): string {
  const permalink = `${root}${postPath(post.date)}`;
  const heading = `<h${level} class="day-title"><a href="${permalink}"><time datetime="${post.date}">${formatDay(post.date)}</time></a></h${level}>`;
  const items = post.items.map((item) => renderItem(item, site, root, permalink));
  return `<article class="day">
${heading}
${items.join("\n")}
</article>`;
}

function renderItem(item: Item, site: SiteOptions, root: string, permalink: string): string {
  const parts: string[] = [];

  // Like Telegram: photos first, caption underneath.
  if (item.images.length) {
    const kind = item.images.length > 1 ? "media gallery" : "media";
    parts.push(`<div class="${kind}">${item.images.map((img) => renderImage(img, root)).join("")}</div>`);
  }
  for (const { text, entities } of item.texts) {
    parts.push(`<div class="text">${renderText(text, entities)}</div>`);
  }

  const edited = item.edited
    ? ` <span class="edited" title="Edited ${escapeHtml(formatDateTime(item.edited, site.timeZone))}">edited</span>`
    : "";
  parts.push(
    `<footer class="meta"><a href="${permalink}#m-${item.id}"><time datetime="${escapeHtml(item.date)}">${formatTime(item.date, site.timeZone)}</time></a>${edited}</footer>`,
  );

  return `<section class="entry" id="m-${item.id}">
${parts.join("\n")}
</section>`;
}

function renderImage(image: Image, root: string): string {
  const src = `${root}media/${escapeHtml(image.file)}`;
  const size = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : "";
  return `<a href="${src}"><img src="${src}" alt="Photo"${size} loading="lazy" decoding="async"></a>`;
}

function renderArchive(posts: Post[]): string {
  const items = posts.map(
    (p) =>
      `<li><a href="${postPath(p.date)}"><time datetime="${p.date}">${formatDay(p.date)}</time></a></li>`,
  );
  return `<section class="archive">
<h2>Earlier</h2>
<ul>${items.join("")}</ul>
</section>`;
}

function layout(page: { site: SiteOptions; root: string; title?: string; body: string }): string {
  const title = page.title ? `${page.title} · ${page.site.title}` : page.site.title;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${page.root}style.css">
</head>
<body>
<header class="site-header"><a href="${page.root}index.html">${escapeHtml(page.site.title)}</a></header>
<main>
${page.body}
</main>
</body>
</html>
`;
}

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

function formatTime(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(timestamp),
  );
}

function formatDateTime(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
