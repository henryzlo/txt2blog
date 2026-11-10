import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { collect, MAX_DOWNLOAD_BYTES } from "../src/collect.ts";
import { createStore, type Store } from "../src/store.ts";
import type { TelegramClient, TgMessage, TgUpdate } from "../src/telegram.ts";

const OWNER = 42424242;
const quiet = () => {};

let dir: string;
let store: Store;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "txt2blog-collect-"));
  store = createStore(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

/** A fake Bot API: serves `pages` in order and records what was asked. */
function fakeTelegram(pages: TgUpdate[][]) {
  const offsets: number[] = [];
  const downloads: string[] = [];
  let next = 0;
  const client: TelegramClient = {
    async getUpdates(offset) {
      offsets.push(offset);
      return pages[next++] ?? [];
    },
    async downloadFile(fileId) {
      downloads.push(fileId);
      return new TextEncoder().encode(`image ${fileId}`);
    },
  };
  return { client, offsets, downloads };
}

let updateId = 0;
function msg(id: number, extra: Partial<TgMessage> = {}): TgMessage {
  return {
    message_id: id,
    from: { id: OWNER, is_bot: false, first_name: "Owner" },
    chat: { id: OWNER, type: "private" },
    date: 1794240000 + id * 60,
    ...extra,
  };
}
const created = (m: TgMessage): TgUpdate => ({ update_id: ++updateId, message: m });
const edited = (m: TgMessage): TgUpdate => ({ update_id: ++updateId, edited_message: m });
const command = (id: number, text: string, replyTo?: TgMessage) =>
  created(
    msg(id, {
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
      ...(replyTo ? { reply_to_message: replyTo } : {}),
    }),
  );
const photo = (unique: string) => [
  { file_id: `${unique}-small`, file_unique_id: `${unique}s`, width: 90, height: 60 },
  { file_id: `${unique}-large`, file_unique_id: unique, width: 1280, height: 853 },
];

const ids = async () => (await store.readEntries()).map((e) => e.id).sort((a, b) => a - b);
const media = async () => (await readdir(join(dir, "media")).catch(() => [] as string[])).sort();

test("saves text and photos, downloading the largest size once", async () => {
  const withPhoto = msg(2, { photo: photo("AQADpic"), caption: "Sunset", caption_entities: [{ type: "bold", offset: 0, length: 6 }] });
  const first = fakeTelegram([[created(msg(1, { text: "hello" })), created(withPhoto)]]);

  const result = await collect(first.client, store, String(OWNER), quiet);

  assert.equal(result.saved, 2);
  assert.deepEqual(first.downloads, ["AQADpic-large"]);
  assert.deepEqual(await media(), ["AQADpic.jpg"]);
  const entry = await store.readEntry(2);
  assert.equal(entry?.text, "Sunset");
  assert.deepEqual(entry?.entities, [{ type: "bold", offset: 0, length: 6 }]);
  assert.deepEqual(entry?.image, { file: "AQADpic.jpg", width: 1280, height: 853 });

  // An edit to the caption updates the entry without downloading again.
  const second = fakeTelegram([[edited({ ...withPhoto, caption: "Sunset, edited", caption_entities: [], edit_date: 1794250000 })]]);
  await collect(second.client, store, String(OWNER), quiet);

  assert.deepEqual(second.downloads, []);
  assert.equal((await store.readEntry(2))?.text, "Sunset, edited");
  assert.equal((await store.readEntry(2))?.edited, new Date(1794250000 * 1000).toISOString());
});

test("remembers the offset so each update is processed once", async () => {
  const first = fakeTelegram([[created(msg(1, { text: "a" })), created(msg(2, { text: "b" }))]]);
  await collect(first.client, store, String(OWNER), quiet);
  const { offset } = await store.readState();

  const second = fakeTelegram([[]]);
  await collect(second.client, store, String(OWNER), quiet);

  assert.deepEqual(first.offsets, [0]);
  assert.deepEqual(second.offsets, [offset]);
  assert.equal(offset, updateId + 1);
});

test("pages through more than 100 updates", async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => created(msg(i + 1, { text: `m${i}` })));
  const page2 = [created(msg(101, { text: "last" }))];
  const { client, offsets } = fakeTelegram([page1, page2]);

  const result = await collect(client, store, String(OWNER), quiet);

  assert.equal(result.saved, 101);
  assert.equal(offsets.length, 2, "stops after a short page without confirming it");
  assert.equal(offsets[1], page1.at(-1)!.update_id + 1);
});

test("/delete removes the replied-to message, or its whole album", async () => {
  const albumA = msg(10, { photo: photo("AQADa"), caption: "album", media_group_id: "g1" });
  const albumB = msg(11, { photo: photo("AQADb"), media_group_id: "g1" });
  const keep = msg(12, { text: "keep me" });
  const loner = msg(13, { text: "delete me" });
  await collect(fakeTelegram([[created(albumA), created(albumB), created(keep), created(loner)]]).client, store, String(OWNER), quiet);
  assert.deepEqual(await media(), ["AQADa.jpg", "AQADb.jpg"]);

  const result = await collect(
    fakeTelegram([[command(14, "/delete", albumB), command(15, "/delete", loner)]]).client,
    store,
    String(OWNER),
    quiet,
  );

  assert.equal(result.deleted, 3);
  assert.deepEqual(await ids(), [12]);
  assert.deepEqual(await media(), [], "images of deleted messages are removed");
  assert.deepEqual((await store.readState()).deleted, [10, 11, 13]);

  // Editing a deleted message later doesn't bring it back.
  await collect(fakeTelegram([[edited({ ...loner, text: "zombie", edit_date: 1794260000 })]]).client, store, String(OWNER), quiet);
  assert.deepEqual(await ids(), [12]);
});

test("ignores other people, group chats, other commands, and unsupported messages", async () => {
  const stranger = msg(1, { text: "hi", from: { id: 7, is_bot: false, first_name: "X" }, chat: { id: 7, type: "private" } });
  const group = msg(2, { text: "in a group", chat: { id: -100, type: "supergroup" } });
  const sticker = msg(3, {}); // no text, caption, or image
  const deleteWithoutReply = command(5, "/delete");

  const result = await collect(
    fakeTelegram([[created(stranger), created(group), command(4, "/start"), created(sticker), deleteWithoutReply]]).client,
    store,
    String(OWNER),
    quiet,
  );

  assert.equal(result.saved, 0);
  assert.equal(result.ignored, 5);
  assert.deepEqual(await ids(), []);
});

test("saves images sent as files, but skips ones too big for bots to download", async () => {
  const doc = (unique: string, size: number, mime = "image/png") => ({
    file_id: `${unique}-id`,
    file_unique_id: unique,
    mime_type: mime,
    file_size: size,
  });
  const lines: string[] = [];
  const { client, downloads } = fakeTelegram([
    [
      created(msg(1, { document: doc("AQADfile", 5_000_000) })),
      created(msg(2, { document: doc("AQADhuge", MAX_DOWNLOAD_BYTES + 1), caption: "too big" })),
      created(msg(3, { document: doc("AQADsvg", 100, "image/svg+xml") })),
    ],
  ]);

  const result = await collect(client, store, String(OWNER), (l) => lines.push(l));

  assert.deepEqual(downloads, ["AQADfile-id"]);
  assert.deepEqual((await store.readEntry(1))?.image, { file: "AQADfile.png", width: null, height: null });
  assert.equal((await store.readEntry(2))?.image, null, "caption kept, image skipped");
  assert.equal(await store.readEntry(3), undefined, "SVG files aren't published");
  assert.equal(result.saved, 2);
  assert.ok(lines.some((l) => l.includes("20 MB")));
});
