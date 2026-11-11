type Env = Record<string, string | undefined>;

export type CollectConfig = {
  token: string;
  ownerId: string;
  contentDir: string;
};

export type BuildConfig = {
  title: string;
  timeZone: string;
  contentDir: string;
  outDir: string;
};

export function loadCollectConfig(env: Env): CollectConfig {
  const { get, required } = reader(env);
  const ownerId = required("TELEGRAM_OWNER_ID");
  if (!/^\d{1,16}$/.test(ownerId)) {
    throw new Error(`TELEGRAM_OWNER_ID must be your numeric Telegram user ID, got "${ownerId}"`);
  }
  return {
    token: required("TELEGRAM_BOT_TOKEN"),
    ownerId,
    contentDir: get("CONTENT_DIR") ?? "content",
  };
}

export function loadBuildConfig(env: Env): BuildConfig {
  const { get } = reader(env);
  const timeZone = get("BLOG_TIMEZONE") ?? "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`BLOG_TIMEZONE "${timeZone}" is not a valid IANA time zone`);
  }
  return {
    title: get("BLOG_TITLE") ?? "hudjack blog",
    timeZone,
    contentDir: get("CONTENT_DIR") ?? "content",
    outDir: get("OUT_DIR") ?? "dist",
  };
}

function reader(env: Env) {
  // CI passes unset repository variables as empty strings; treat them as unset.
  const get = (name: string) => env[name]?.trim() || undefined;
  const required = (name: string) => {
    const value = get(name);
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  };
  return { get, required };
}
