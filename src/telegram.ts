// Minimal Telegram Bot API client. The bot never runs as a server: each CI
// run polls getUpdates, saves what it finds, and exits.
// Never put a request URL in an error or log line: it contains the token.

const API_BASE = "https://api.telegram.org";
const MAX_RETRIES = 5;
export const PAGE_SIZE = 100;

export type TgEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
};

export type TgPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TgDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TgMessage = {
  message_id: number;
  from?: { id: number; is_bot: boolean; first_name: string };
  chat: { id: number; type: string };
  date: number;
  edit_date?: number;
  media_group_id?: string;
  text?: string;
  entities?: TgEntity[];
  caption?: string;
  caption_entities?: TgEntity[];
  photo?: TgPhotoSize[];
  document?: TgDocument;
  reply_to_message?: TgMessage;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

export type FetchFn = typeof fetch;

export type TelegramClient = {
  /** Returns pending updates from `offset` on. Requesting an offset tells
   * Telegram to drop every update before it. */
  getUpdates(offset: number): Promise<TgUpdate[]>;
  downloadFile(fileId: string): Promise<Uint8Array>;
};

type ApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
  parameters?: { retry_after?: number };
};

export function createTelegramClient(token: string, fetchFn: FetchFn = fetch): TelegramClient {
  async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(`${API_BASE}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse<T>;

      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep((data.parameters?.retry_after ?? 1) * 1000);
        continue;
      }
      if (!res.ok || !data.ok) {
        throw new Error(`Telegram ${method} failed: ${res.status} ${data.description ?? ""}`.trim());
      }
      return data.result as T;
    }
  }

  return {
    getUpdates(offset) {
      return call<TgUpdate[]>("getUpdates", {
        offset,
        limit: PAGE_SIZE,
        timeout: 0,
        allowed_updates: ["message", "edited_message"],
      });
    },

    async downloadFile(fileId) {
      const file = await call<{ file_path?: string }>("getFile", { file_id: fileId });
      if (!file.file_path) throw new Error("Telegram getFile returned no file path");
      const res = await fetchFn(`${API_BASE}/file/bot${token}/${file.file_path}`);
      if (!res.ok) throw new Error(`Downloading a Telegram file failed: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
