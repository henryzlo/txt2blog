import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBuildConfig, loadCollectConfig } from "../src/config.ts";

test("collect needs a token and a numeric owner ID", () => {
  const config = loadCollectConfig({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_OWNER_ID: "123456789" });
  assert.equal(config.ownerId, "123456789");
  assert.equal(config.contentDir, "content");

  assert.throws(() => loadCollectConfig({ TELEGRAM_OWNER_ID: "123" }), /TELEGRAM_BOT_TOKEN/);
  assert.throws(() => loadCollectConfig({ TELEGRAM_BOT_TOKEN: "t" }), /TELEGRAM_OWNER_ID/);
  assert.throws(
    () => loadCollectConfig({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_OWNER_ID: "@henry" }),
    /numeric Telegram user ID/,
  );
});

test("build needs no secrets and treats empty strings as unset", () => {
  const config = loadBuildConfig({ BLOG_TITLE: "", BLOG_TIMEZONE: "" });
  assert.deepEqual(config, { title: "txt2blog", timeZone: "UTC", contentDir: "content", outDir: "dist" });
});

test("build rejects unknown time zones", () => {
  assert.throws(() => loadBuildConfig({ BLOG_TIMEZONE: "Mars/Olympus" }), /time zone/);
});
