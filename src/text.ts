// Turns a Telegram message's text + formatting entities into safe HTML.
//
// Telegram doesn't send markdown: it sends plain text plus "entities", each a
// (type, offset, length) range in UTF-16 code units, which is exactly how JS
// strings index. Entities nest but never partially overlap. All text is
// escaped and only a fixed set of tags is emitted, so the output can never
// contain markup or script from the message.

import type { TgEntity } from "./telegram.ts";

type Span = { type: string; start: number; end: number; url?: string };

const BLOCK_TYPES = new Set(["pre", "blockquote", "expandable_blockquote"]);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderText(text: string, entities: TgEntity[] = []): string {
  const spans = entities
    .map((e) => ({ type: e.type, start: e.offset, end: e.offset + e.length, url: e.url }))
    .filter((s) => s.start >= 0 && s.end <= text.length && s.start < s.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  return renderRange(text, 0, text.length, spans).trim();
}

function renderRange(text: string, start: number, end: number, spans: Span[]): string {
  let html = "";
  let pos = start;
  let afterBlock = false;

  for (let i = 0; i < spans.length; ) {
    const span = spans[i] as Span;
    // Everything that starts inside this span is nested in it.
    let j = i + 1;
    while (j < spans.length && (spans[j] as Span).start < span.end) j++;
    const children = spans.slice(i + 1, j).map((c) => ({ ...c, end: Math.min(c.end, span.end) }));

    const isBlock = BLOCK_TYPES.has(span.type);
    html += renderPlain(text.slice(pos, span.start), afterBlock, isBlock);
    html += wrap(span, text.slice(span.start, span.end), () =>
      renderRange(text, span.start, span.end, children),
    );
    pos = span.end;
    afterBlock = isBlock;
    i = j;
  }
  return html + renderPlain(text.slice(pos, end), afterBlock, false);
}

// Block elements already break the line, so drop the newline that separates
// them from the surrounding text instead of turning it into a <br>.
function renderPlain(text: string, afterBlock: boolean, beforeBlock: boolean): string {
  let t = text;
  if (afterBlock) t = t.replace(/^\n/, "");
  if (beforeBlock) t = t.replace(/\n$/, "");
  return escapeHtml(t).replace(/\n/g, "<br>\n");
}

function wrap(span: Span, raw: string, inner: () => string): string {
  switch (span.type) {
    case "bold":
      return `<strong>${inner()}</strong>`;
    case "italic":
      return `<em>${inner()}</em>`;
    case "underline":
      return `<u>${inner()}</u>`;
    case "strikethrough":
      return `<s>${inner()}</s>`;
    case "spoiler":
      return `<span class="spoiler" tabindex="0">${inner()}</span>`;
    case "code":
      return `<code>${escapeHtml(raw)}</code>`;
    case "pre":
      return `<pre><code>${escapeHtml(raw.replace(/^\n+|\n+$/g, ""))}</code></pre>`;
    case "blockquote":
    case "expandable_blockquote":
      return `<blockquote>${inner()}</blockquote>`;
    case "text_link":
      return link(span.url, inner());
    case "url":
      return link(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`, inner());
    case "email":
      return `<a href="mailto:${escapeHtml(raw)}">${inner()}</a>`;
    default:
      // mention, hashtag, cashtag, phone_number, custom_emoji, …: plain text
      return inner();
  }
}

function link(url: string | undefined, innerHtml: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return innerHtml;
  return `<a href="${escapeHtml(url)}">${innerHtml}</a>`;
}
