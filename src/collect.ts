// Turns pending Telegram updates into content files.
//
//   new message      → saved (text, caption, and/or image)
//   edited message   → saved again over the old one
//   reply "/delete"  → the replied-to message (or its whole album) is removed
//
// Telegram never tells bots about messages deleted in the app, which is why
// deleting goes through /delete.

import { PAGE_SIZE, type TelegramClient, type TgEntity, type TgMessage } from "./telegram.ts";
import { isSafeMediaName, type Entry, type Image, type Store } from "./store.ts";

/** Bots can only download files up to 20 MB through the Bot API. */
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

// Images sent "as a file" (uncompressed). SVG is left out on purpose: it can
// carry script when opened directly.
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

export type CollectResult = {
  updates: number;
  saved: number;
  deleted: number;
  ignored: number;
  downloaded: number;
  pruned: number;
};

export async function collect(
  client: TelegramClient,
  store: Store,
  ownerId: string,
  log: (line: string) => void = console.log,
): Promise<CollectResult> {
  const state = await store.readState();
  const deleted = new Set(state.deleted);
  const result: CollectResult = { updates: 0, saved: 0, deleted: 0, ignored: 0, downloaded: 0, pruned: 0 };

  async function saveImage(message: TgMessage): Promise<Image | null> {
    const source = pickImage(message, log);
    if (!source) return null;
    const file = `${source.uniqueId}${source.ext}`;
    if (!isSafeMediaName(file)) throw new Error(`Unexpected Telegram file id: ${source.uniqueId}`);
    if (!(await store.hasMedia(file))) {
      await store.writeMedia(file, await client.downloadFile(source.fileId));
      result.downloaded++;
    }
    return { file, width: source.width, height: source.height };
  }

  async function remove(targetId: number): Promise<void> {
    const target = await store.readEntry(targetId);
    const ids = target?.album
      ? (await store.readEntries()).filter((e) => e.album === target.album).map((e) => e.id)
      : [targetId];
    for (const id of ids) {
      await store.deleteEntry(id);
      deleted.add(id);
    }
    if (target) result.deleted += ids.length;
  }

  async function apply(message: TgMessage | undefined): Promise<void> {
    if (!message || !isFromOwner(message, ownerId)) {
      result.ignored++;
      return;
    }
    if (isCommand(message)) {
      const isDelete = /^\/delete(?:@\w+)?$/i.test((message.text ?? "").trim());
      if (isDelete && message.reply_to_message) await remove(message.reply_to_message.message_id);
      else result.ignored++;
      return;
    }
    if (deleted.has(message.message_id)) {
      result.ignored++; // an edit to something already removed with /delete
      return;
    }

    const image = await saveImage(message);
    const text = message.text ?? message.caption ?? "";
    if (!image && text.trim() === "") {
      log(`Skipped message ${message.message_id}: only text and images are published`);
      result.ignored++;
      return;
    }
    await store.writeEntry(toEntry(message, text, image));
    result.saved++;
  }

  // Asking for a later offset makes Telegram drop everything before it. The
  // offset is saved in state.json and committed with the content, so this
  // run's last page is only confirmed by the next run, after it's stored.
  let offset = state.offset;
  for (;;) {
    const updates = await client.getUpdates(offset);
    for (const update of updates) {
      result.updates++;
      offset = Math.max(offset, update.update_id + 1);
      await apply(update.message ?? update.edited_message);
    }
    if (updates.length < PAGE_SIZE) break;
  }

  const entries = await store.readEntries();
  result.pruned = await store.pruneMedia(
    new Set(entries.flatMap((e) => (e.image ? [e.image.file] : []))),
  );
  await store.writeState({ offset, deleted: [...deleted].sort((a, b) => a - b) });
  return result;
}

function isFromOwner(message: TgMessage, ownerId: string): boolean {
  return message.chat.type === "private" && String(message.from?.id) === ownerId;
}

function isCommand(message: TgMessage): boolean {
  return message.entities?.some((e) => e.type === "bot_command" && e.offset === 0) ?? false;
}

function toEntry(message: TgMessage, text: string, image: Image | null): Entry {
  const entities = (message.text !== undefined ? message.entities : message.caption_entities) ?? [];
  return {
    id: message.message_id,
    date: isoDate(message.date),
    edited: message.edit_date ? isoDate(message.edit_date) : null,
    album: message.media_group_id ?? null,
    text,
    // Keep only what rendering needs (text_mention entities carry user data).
    entities: entities.map(({ type, offset, length, url, language }): TgEntity => ({
      type,
      offset,
      length,
      ...(url ? { url } : {}),
      ...(language ? { language } : {}),
    })),
    image,
  };
}

type ImageSource = {
  fileId: string;
  uniqueId: string;
  ext: string;
  width: number | null;
  height: number | null;
};

function pickImage(message: TgMessage, log: (line: string) => void): ImageSource | undefined {
  if (message.photo?.length) {
    const largest = message.photo.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    return {
      fileId: largest.file_id,
      uniqueId: largest.file_unique_id,
      ext: ".jpg",
      width: largest.width,
      height: largest.height,
    };
  }

  const doc = message.document;
  const ext = doc?.mime_type ? IMAGE_EXT[doc.mime_type] : undefined;
  if (!doc || !ext) return undefined;
  if ((doc.file_size ?? 0) > MAX_DOWNLOAD_BYTES) {
    log(`Skipped the image in message ${message.message_id}: bots can't download files over 20 MB`);
    return undefined;
  }
  return { fileId: doc.file_id, uniqueId: doc.file_unique_id, ext, width: null, height: null };
}

function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}
