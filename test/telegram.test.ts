import assert from "node:assert/strict";
import { test } from "node:test";
import { createTelegramClient, type FetchFn } from "../src/telegram.ts";

const TOKEN = "123456:SECRET-token";

function fakeFetch(handler: (url: URL, body: Record<string, unknown>) => Response) {
  const calls: { url: URL; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    return handler(url, body);
  }) as FetchFn;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("getUpdates asks for messages and edits from an offset", async () => {
  const { fetchFn, calls } = fakeFetch(() => json({ ok: true, result: [{ update_id: 5 }] }));

  const updates = await createTelegramClient(TOKEN, fetchFn).getUpdates(5);

  assert.deepEqual(updates, [{ update_id: 5 }]);
  assert.equal(calls[0]?.url.pathname, `/bot${TOKEN}/getUpdates`);
  assert.deepEqual(calls[0]?.body, {
    offset: 5,
    limit: 100,
    timeout: 0,
    allowed_updates: ["message", "edited_message"],
  });
});

test("retries after a rate limit", async () => {
  let attempts = 0;
  const { fetchFn } = fakeFetch(() =>
    ++attempts === 1
      ? json({ ok: false, error_code: 429, parameters: { retry_after: 0 } }, 429)
      : json({ ok: true, result: [] }),
  );

  await createTelegramClient(TOKEN, fetchFn).getUpdates(0);

  assert.equal(attempts, 2);
});

test("errors explain the failure without leaking the token", async () => {
  const { fetchFn } = fakeFetch(() =>
    json({ ok: false, error_code: 409, description: "Conflict: can't use getUpdates while webhook is active" }, 409),
  );

  await assert.rejects(createTelegramClient(TOKEN, fetchFn).getUpdates(0), (error: Error) => {
    assert.match(error.message, /getUpdates failed: 409 Conflict/);
    assert.doesNotMatch(error.message, /SECRET/);
    return true;
  });
});

test("downloadFile resolves the file path, then downloads it", async () => {
  const { fetchFn, calls } = fakeFetch((url) =>
    url.pathname.endsWith("/getFile")
      ? json({ ok: true, result: { file_path: "photos/file_1.jpg" } })
      : new Response("JPEGDATA"),
  );

  const data = await createTelegramClient(TOKEN, fetchFn).downloadFile("abc");

  assert.equal(new TextDecoder().decode(data), "JPEGDATA");
  assert.deepEqual(calls[0]?.body, { file_id: "abc" });
  assert.equal(calls[1]?.url.pathname, `/file/bot${TOKEN}/photos/file_1.jpg`);
});
