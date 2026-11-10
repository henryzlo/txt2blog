import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { groupByDay } from "./posts.ts";
import { postPath, renderIndex, renderPostPage, type SiteOptions } from "./render.ts";
import { createStore } from "./store.ts";

const STYLESHEET = fileURLToPath(new URL("../static/style.css", import.meta.url));

export type BuildOptions = {
  contentDir: string;
  outDir: string;
  site: SiteOptions;
};

export type BuildResult = {
  posts: number;
  entries: number;
  images: number;
};

/** Regenerates the whole site from the content directory. No network. */
export async function buildSite({ contentDir, outDir, site }: BuildOptions): Promise<BuildResult> {
  assertSafeOutDir(outDir);

  const store = createStore(contentDir);
  const entries = await store.readEntries();
  const posts = groupByDay(entries, site.timeZone);
  const images = entries.flatMap((e) => (e.image ? [e.image.file] : []));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, "posts"), { recursive: true });
  await mkdir(join(outDir, "media"), { recursive: true });
  await copyFile(STYLESHEET, join(outDir, "style.css"));
  for (const file of images) {
    await copyFile(store.mediaPath(file), join(outDir, "media", file));
  }

  await writeFile(join(outDir, "index.html"), renderIndex(posts, site));
  for (const [i, post] of posts.entries()) {
    const page = renderPostPage(post, site, posts[i - 1], posts[i + 1]);
    await writeFile(join(outDir, postPath(post.date)), page);
  }

  return { posts: posts.length, entries: entries.length, images: images.length };
}

// The output directory is wiped on every build; refuse obviously wrong ones.
function assertSafeOutDir(outDir: string): void {
  const target = resolve(outDir);
  if (target === resolve(process.cwd()) || target === dirname(target)) {
    throw new Error(`Refusing to use ${target} as the output directory`);
  }
}
