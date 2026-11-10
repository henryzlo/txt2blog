// The blog's data lives in plain files (committed to the repo by CI):
//
//   content/state.json            Telegram update offset + IDs removed with /delete
//   content/messages/<id>.json    one Entry per Telegram message
//   content/media/<file>          downloaded images
//
// Deleting a message file by hand removes it from the blog too.

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TgEntity } from "./telegram.ts";

export type Image = {
  file: string;
  width: number | null;
  height: number | null;
};

export type Entry = {
  id: number;
  /** ISO 8601, UTC. When the message was first sent. */
  date: string;
  edited: string | null;
  /** Telegram media_group_id: photos sent together as an album. */
  album: string | null;
  text: string;
  entities: TgEntity[];
  image: Image | null;
};

export type State = {
  /** Next Telegram update_id to request. */
  offset: number;
  /** Message IDs removed with /delete, so later edits don't bring them back. */
  deleted: number[];
};

export type Store = ReturnType<typeof createStore>;

const MEDIA_NAME = /^[A-Za-z0-9_-]{1,100}\.[a-z0-9]{1,10}$/;

export function isSafeMediaName(name: string): boolean {
  return MEDIA_NAME.test(name);
}

export function createStore(dir: string) {
  const messagesDir = join(dir, "messages");
  const mediaDir = join(dir, "media");
  const statePath = join(dir, "state.json");
  const entryPath = (id: number) => join(messagesDir, `${id}.json`);
  const mediaPath = (file: string) => {
    if (!isSafeMediaName(file)) throw new Error(`Unsafe media file name: ${file}`);
    return join(mediaDir, file);
  };

  return {
    mediaPath,

    async readState(): Promise<State> {
      const state = await readJson<Partial<State>>(statePath);
      return { offset: state?.offset ?? 0, deleted: state?.deleted ?? [] };
    },

    writeState(state: State): Promise<void> {
      return writeJson(statePath, state);
    },

    async readEntries(): Promise<Entry[]> {
      const names = (await listDir(messagesDir)).filter((name) => name.endsWith(".json"));
      const entries = await Promise.all(names.map((name) => readJson<Entry>(join(messagesDir, name))));
      return entries.filter((entry): entry is Entry => entry !== undefined);
    },

    readEntry(id: number): Promise<Entry | undefined> {
      return readJson<Entry>(entryPath(id));
    },

    writeEntry(entry: Entry): Promise<void> {
      return writeJson(entryPath(entry.id), entry);
    },

    async deleteEntry(id: number): Promise<void> {
      await rm(entryPath(id), { force: true });
    },

    async hasMedia(file: string): Promise<boolean> {
      try {
        await stat(mediaPath(file));
        return true;
      } catch {
        return false;
      }
    },

    async writeMedia(file: string, data: Uint8Array): Promise<void> {
      const target = mediaPath(file);
      await mkdir(mediaDir, { recursive: true });
      await writeFile(`${target}.part`, data);
      await rename(`${target}.part`, target);
    },

    /** Deletes media files no entry references. Returns how many. */
    async pruneMedia(keep: Set<string>): Promise<number> {
      let pruned = 0;
      for (const name of await listDir(mediaDir)) {
        if (keep.has(name)) continue;
        await rm(join(mediaDir, name), { force: true });
        pruned++;
      }
      return pruned;
    },
  };
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
