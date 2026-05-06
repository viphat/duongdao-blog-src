import { createClient } from "@tursodatabase/serverless/compat";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://localhost:8787",
  "http://127.0.0.1:8787"
];

let schemaReady;

export default {
  async fetch(request, env) {
    const cors = buildCors(request, env);

    if (!cors.allowed) {
      return json({ error: "Origin is not allowed" }, 403, cors.headers);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors.headers });
    }

    try {
      const url = new URL(request.url);

      if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
        return json({ error: "Turso credentials are not configured" }, 500, cors.headers);
      }

      const client = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN
      });

      await ensureSchema(client);

      if (request.method === "POST" && url.pathname.endsWith("/pageview")) {
        return handlePageview(request, client, cors.headers);
      }

      if (request.method === "GET" && url.pathname.endsWith("/summary")) {
        return handleSummary(url, client, cors.headers);
      }

      return json({ error: "Not found" }, 404, cors.headers);
    } catch (error) {
      return json({ error: "Analytics request failed" }, 500, cors.headers);
    }
  }
};

async function ensureSchema(client) {
  if (!schemaReady) {
    schemaReady = createSchema(client).catch(function (error) {
      schemaReady = undefined;
      throw error;
    });
  }

  return schemaReady;
}

async function createSchema(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS page_views (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      page_type TEXT NOT NULL DEFAULT 'page',
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS site_stats (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function handlePageview(request, client, headers) {
  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON body" }, 400, headers);
  }

  const path = normalizePath(payload.path);
  if (!path) {
    return json({ error: "A valid path is required" }, 400, headers);
  }

  const title = cleanText(payload.title, 180);
  const pageType = cleanPageType(payload.pageType);

  const pageResult = await client.execute({
    sql: `
      INSERT INTO page_views (path, title, page_type, views, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        page_type = excluded.page_type,
        views = page_views.views + 1,
        updated_at = datetime('now')
      RETURNING views
    `,
    args: [path, title, pageType]
  });

  const totalResult = await client.execute({
    sql: `
      INSERT INTO site_stats (key, value, updated_at)
      VALUES ('total_page_views', 1, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = site_stats.value + 1,
        updated_at = datetime('now')
      RETURNING value
    `
  });

  return json({
    path,
    views: numberFromRow(pageResult.rows[0], "views"),
    totalPageViews: numberFromRow(totalResult.rows[0], "value")
  }, 200, headers);
}

async function handleSummary(url, client, headers) {
  const path = normalizePath(url.searchParams.get("path"));
  if (!path) {
    return json({ error: "A valid path is required" }, 400, headers);
  }

  const pageResult = await client.execute({
    sql: "SELECT views FROM page_views WHERE path = ?",
    args: [path]
  });

  const totalResult = await client.execute({
    sql: "SELECT value FROM site_stats WHERE key = 'total_page_views'"
  });

  return json({
    path,
    views: numberFromRow(pageResult.rows[0], "views"),
    totalPageViews: numberFromRow(totalResult.rows[0], "value")
  }, 200, headers);
}

function buildCors(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set(DEFAULT_ALLOWED_ORIGINS);

  String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(function (value) {
      return value.trim();
    })
    .filter(Boolean)
    .forEach(function (value) {
      allowedOrigins.add(value);
    });

  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };

  if (!origin) {
    return { allowed: true, headers };
  }

  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    return { allowed: true, headers };
  }

  return { allowed: false, headers };
}

function normalizePath(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value, "https://duongdao.family");
    let path = url.pathname || "/";
    path = path.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
    if (!path.startsWith("/")) path = "/" + path;
    if (path.length > 1) path = path.replace(/\/+$/, "/");
    if (path.length > 512) return null;
    return path;
  } catch (error) {
    return null;
  }
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanPageType(value) {
  const pageType = cleanText(value, 40);
  return pageType || "page";
}

function numberFromRow(row, key) {
  if (!row) return 0;
  return Number(row[key] || 0);
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
