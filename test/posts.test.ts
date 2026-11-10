import assert from "node:assert/strict";
import { test } from "node:test";
import { dayKey, groupByDay } from "../src/posts.ts";
import type { Entry } from "../src/store.ts";

function entry(id: number, date: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    date,
    edited: null,
    album: null,
    text: `message ${id}`,
    entities: [],
    image: null,
    ...overrides,
  };
}

test("groups by calendar day in the blog's time zone", () => {
  // 03:30 UTC on the 8th is 22:30 on the 7th in New York.
  assert.equal(dayKey("2026-11-08T03:30:00Z", "America/New_York"), "2026-11-07");
  assert.equal(dayKey("2026-11-08T03:30:00Z", "UTC"), "2026-11-08");
});

test("posts are newest day first, items oldest first", () => {
  const posts = groupByDay(
    [
      entry(4, "2026-11-09T15:00:00Z"),
      entry(3, "2026-11-08T15:00:00Z"),
      entry(1, "2026-11-07T15:00:00Z"),
      entry(2, "2026-11-08T03:30:00Z"),
    ],
    "America/New_York",
  );
  assert.deepEqual(
    posts.map((p) => [p.date, p.items.map((i) => i.id)]),
    [
      ["2026-11-09", [4]],
      ["2026-11-08", [3]],
      ["2026-11-07", [1, 2]],
    ],
  );
});

test("an album becomes one item with all its photos", () => {
  const photo = (file: string) => ({ file, width: 10, height: 10 });
  const [post] = groupByDay(
    [
      entry(1, "2026-11-09T15:00:00Z", { album: "a", text: "caption", image: photo("a.jpg") }),
      entry(2, "2026-11-09T15:00:00Z", { album: "a", text: "", image: photo("b.jpg"), edited: "2026-11-09T16:00:00Z" }),
      entry(3, "2026-11-09T15:01:00Z"),
    ],
    "UTC",
  );
  assert.equal(post?.items.length, 2);
  const album = post?.items[0];
  assert.deepEqual(album?.images.map((i) => i.file), ["a.jpg", "b.jpg"]);
  assert.deepEqual(album?.texts.map((t) => t.text), ["caption"]);
  assert.equal(album?.edited, "2026-11-09T16:00:00Z");
});
