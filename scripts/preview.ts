// Builds the site from fixtures/content into dist/ so you can check
// templates and CSS without Telegram. Open dist/index.html.
import { buildSite } from "../src/build.ts";

const result = await buildSite({
  contentDir: "fixtures/content",
  outDir: "dist",
  site: { title: "hudjack blog", timeZone: "America/New_York" },
});

console.log(`Built ${result.posts} sample posts into dist/ — open dist/index.html`);
