// CI entry point.
//   node src/cli.ts collect   Telegram → content/   (needs the bot token)
//   node src/cli.ts build     content/ → dist/      (no network)
import { buildSite } from "./build.ts";
import { collect } from "./collect.ts";
import { loadBuildConfig, loadCollectConfig } from "./config.ts";
import { createStore } from "./store.ts";
import { createTelegramClient } from "./telegram.ts";

const commands: Record<string, () => Promise<void>> = {
  async collect() {
    const config = loadCollectConfig(process.env);
    const r = await collect(
      createTelegramClient(config.token),
      createStore(config.contentDir),
      config.ownerId,
    );
    console.log(
      `Processed ${r.updates} updates: ${r.saved} saved, ${r.deleted} deleted, ${r.ignored} ignored. ` +
        `Images: ${r.downloaded} downloaded, ${r.pruned} removed.`,
    );
  },

  async build() {
    const config = loadBuildConfig(process.env);
    const r = await buildSite({
      contentDir: config.contentDir,
      outDir: config.outDir,
      site: { title: config.title, timeZone: config.timeZone },
    });
    console.log(`Built ${r.posts} posts from ${r.entries} messages (${r.images} images) into ${config.outDir}/`);
  },
};

const command = commands[process.argv[2] ?? ""];
if (!command) {
  console.error("Usage: node src/cli.ts <collect|build>");
  process.exitCode = 2;
} else {
  command().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
