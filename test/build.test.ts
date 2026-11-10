import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { buildSite } from "../src/build.ts";

const contentDir = fileURLToPath(new URL("../fixtures/content", import.meta.url));
const site = { title: "Test blog", timeZone: "America/New_York" };
const work = await mkdtemp(join(tmpdir(), "txt2blog-build-"));
const outDir = join(work, "dist");
after(() => rm(work, { recursive: true, force: true }));

const page = (path: string) => readFile(join(outDir, path), "utf8");

test("builds the home page, a page per day, and copies images", async () => {
  const result = await buildSite({ contentDir, outDir, site });

  assert.deepEqual(result, { posts: 3, entries: 7, images: 3 });
  assert.deepEqual((await readdir(join(outDir, "posts"))).sort(), [
    "2026-11-07.html",
    "2026-11-08.html",
    "2026-11-09.html",
  ]);
  assert.deepEqual((await readdir(join(outDir, "media"))).sort(), [
    "AQADmarket01.svg",
    "AQADmarket02.svg",
    "AQADsunset01.svg",
  ]);
  assert.ok((await readdir(outDir)).includes("style.css"));
});

test("pages contain no script and render formatting", async () => {
  await buildSite({ contentDir, outDir, site });
  const pages = await Promise.all([
    page("index.html"),
    ...["2026-11-07", "2026-11-08", "2026-11-09"].map((d) => page(`posts/${d}.html`)),
  ]);

  for (const html of pages) assert.doesNotMatch(html, /<script/i);
  const nov9 = pages[3]!;
  assert.match(nov9, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(nov9, /<a href="https:\/\/github.com\/henryzlo\/txt2blog">on GitHub<\/a>/);
  assert.match(nov9, /<div class="media gallery">(<a [^>]+><img [^>]+><\/a>){2}<\/div>/, "album renders as one gallery");
  assert.match(pages[1]!, /lands on the 7th/, "late-night message is grouped by local day");
});

test("an empty content directory builds an empty blog", async () => {
  const result = await buildSite({ contentDir: join(work, "nothing"), outDir, site });
  assert.equal(result.posts, 0);
  assert.match(await page("index.html"), /Nothing here yet/);
});
