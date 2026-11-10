import type { Entry, Image } from "./store.ts";
import type { TgEntity } from "./telegram.ts";

/** One thing on the page: a message, or an album of photos sent together. */
export type Item = {
  /** The first message's ID; used as the anchor. */
  id: number;
  date: string;
  edited: string | null;
  images: Image[];
  texts: { text: string; entities: TgEntity[] }[];
};

/** One blog post: everything sent on one calendar day. */
export type Post = {
  /** Calendar day in the blog's time zone, as YYYY-MM-DD. */
  date: string;
  /** Oldest first. */
  items: Item[];
};

/** Groups entries into posts, newest day first. */
export function groupByDay(entries: Entry[], timeZone: string): Post[] {
  const days = new Map<string, Item[]>();
  const albums = new Map<string, Item>();

  // Telegram message IDs increase in send order.
  for (const entry of [...entries].sort((a, b) => a.id - b.id)) {
    const text = entry.text.trim() ? [{ text: entry.text, entities: entry.entities }] : [];
    const album = entry.album ? albums.get(entry.album) : undefined;
    if (album) {
      if (entry.image) album.images.push(entry.image);
      album.texts.push(...text);
      album.edited = latest(album.edited, entry.edited);
      continue;
    }

    const item: Item = {
      id: entry.id,
      date: entry.date,
      edited: entry.edited,
      images: entry.image ? [entry.image] : [],
      texts: text,
    };
    if (entry.album) albums.set(entry.album, item);

    const day = dayKey(entry.date, timeZone);
    const list = days.get(day);
    if (list) list.push(item);
    else days.set(day, [item]);
  }

  return [...days.entries()]
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function dayKey(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
