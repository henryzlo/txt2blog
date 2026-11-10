import assert from "node:assert/strict";
import { test } from "node:test";
import { renderText } from "../src/text.ts";
import type { TgEntity } from "../src/telegram.ts";

const e = (type: string, offset: number, length: number, extra: Partial<TgEntity> = {}): TgEntity => ({
  type,
  offset,
  length,
  ...extra,
});

test("escapes everything and keeps line breaks", () => {
  assert.equal(
    renderText(`<script>alert("x")</script>\nline two`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>\nline two",
  );
});

test("renders styles, including nested ones", () => {
  // "bold and italic": bold over all of it, italic over "italic"
  assert.equal(
    renderText("bold and italic", [e("bold", 0, 15), e("italic", 9, 6)]),
    "<strong>bold and <em>italic</em></strong>",
  );
  assert.equal(
    renderText("u s x", [e("underline", 0, 1), e("strikethrough", 2, 1), e("spoiler", 4, 1)]),
    '<u>u</u> <s>s</s> <span class="spoiler" tabindex="0">x</span>',
  );
});

test("offsets are UTF-16 code units, like Telegram's", () => {
  // The emoji is two code units, so "hi" starts at offset 3.
  assert.equal(renderText("😀 hi there", [e("bold", 3, 2)]), "😀 <strong>hi</strong> there");
});

test("code and pre are literal", () => {
  assert.equal(renderText("run <b>", [e("code", 4, 3)]), "run <code>&lt;b&gt;</code>");
  assert.equal(
    renderText("see:\nif (a < b) {}\ndone", [e("pre", 5, 13, { language: "js" })]),
    "see:<pre><code>if (a &lt; b) {}</code></pre>done",
  );
});

test("blockquotes don't add stray line breaks", () => {
  assert.equal(
    renderText("intro\nquoted line\noutro", [e("blockquote", 6, 11)]),
    "intro<blockquote>quoted line</blockquote>outro",
  );
});

test("links: text links, bare URLs, emails", () => {
  assert.equal(
    renderText("docs", [e("text_link", 0, 4, { url: "https://example.com/d" })]),
    '<a href="https://example.com/d">docs</a>',
  );
  assert.equal(
    renderText("example.com/a?b=1&c=2", [e("url", 0, 21)]),
    '<a href="https://example.com/a?b=1&amp;c=2">example.com/a?b=1&amp;c=2</a>',
  );
  assert.equal(renderText("me@x.io", [e("email", 0, 7)]), '<a href="mailto:me@x.io">me@x.io</a>');
});

test("only http(s) links are linked", () => {
  assert.equal(renderText("click", [e("text_link", 0, 5, { url: "javascript:alert(1)" })]), "click");
  assert.equal(renderText("tg://resolve", [e("url", 0, 12)]), "tg://resolve");
});

test("ignores entities that are out of range or unknown", () => {
  assert.equal(renderText("hi #tag", [e("bold", 1, 99), e("hashtag", 3, 4)]), "hi #tag");
});
