import { createClient } from "@tursodatabase/serverless/compat";
import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://localhost:8788",
  "http://127.0.0.1:8788"
];

const COMMENT_RATE_LIMIT = 5;
const MAX_NAME_LENGTH = 80;
const MAX_BODY_LENGTH = 2000;
const MAX_USER_AGENT_LENGTH = 240;

let schemaReady;
const jwksCache = new Map();

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
      if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
        return json({ error: "Turso credentials are not configured" }, 500, cors.headers);
      }

      const url = new URL(request.url);
      const route = normalizeRoute(url.pathname);
      const client = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN
      });

      await ensureSchema(client);

      if (request.method === "GET" && isCommentsRoot(route)) {
        return handlePublicList(url, client, cors.headers);
      }

      if (request.method === "POST" && isCommentsRoot(route)) {
        return handleCreateComment(request, env, client, cors.headers);
      }

      if (request.method === "GET" && isAuthorRoot(route)) {
        const author = await requireAuthor(request, env);
        return handleAuthorList(url, client, cors.headers, author);
      }

      const actionMatch = route.match(/^\/api\/comments\/author\/([^/]+)\/(approve|reject|reply)$/);
      if (request.method === "POST" && actionMatch) {
        const author = await requireAuthor(request, env);
        return handleAuthorAction(request, client, cors.headers, author, actionMatch[1], actionMatch[2]);
      }

      return json({ error: "Not found" }, 404, cors.headers);
    } catch (error) {
      if (error && error.status) {
        return json({ error: error.message }, error.status, cors.headers);
      }

      return json({ error: "Comments request failed" }, 500, cors.headers);
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
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      parent_id TEXT,
      author_type TEXT NOT NULL CHECK (author_type IN ('visitor', 'author')),
      display_name TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      author_email TEXT,
      ip_hash TEXT,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_comments_public
    ON comments (path, status, created_at)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_comments_parent
    ON comments (parent_id, created_at)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS comment_rate_limits (
      bucket TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bucket, ip_hash, action)
    )
  `);
}

async function handlePublicList(url, client, headers) {
  const path = normalizePath(url.searchParams.get("path"));
  if (!path) {
    return json({ error: "A valid path is required" }, 400, headers);
  }

  const result = await client.execute({
    sql: `
      SELECT id, path, parent_id, author_type, display_name, body, status, created_at, updated_at
      FROM comments
      WHERE path = ? AND status = 'approved'
      ORDER BY created_at ASC
    `,
    args: [path]
  });

  return json({
    path,
    comments: rowsToCommentTree(result.rows, false)
  }, 200, headers);
}

async function handleAuthorList(url, client, headers) {
  const path = normalizePath(url.searchParams.get("path"));
  if (!path) {
    return json({ error: "A valid path is required" }, 400, headers);
  }

  const result = await client.execute({
    sql: `
      SELECT id, path, parent_id, author_type, display_name, body, status, author_email, created_at, updated_at
      FROM comments
      WHERE path = ?
      ORDER BY created_at ASC
    `,
    args: [path]
  });

  return json({
    path,
    comments: rowsToCommentTree(result.rows, true)
  }, 200, headers);
}

async function handleCreateComment(request, env, client, headers) {
  const payload = await parseJson(request);
  const path = normalizePath(payload.path);
  const name = cleanText(payload.name, MAX_NAME_LENGTH);
  const body = cleanMultilineText(payload.body, MAX_BODY_LENGTH);

  if (!path) {
    return json({ error: "A valid path is required" }, 400, headers);
  }

  if (!name) {
    return json({ error: "Name is required" }, 400, headers);
  }

  if (!body) {
    return json({ error: "Comment is required" }, 400, headers);
  }

  if (cleanText(payload.website, 120)) {
    return json({ status: "pending" }, 202, headers);
  }

  const ipHash = await hashClientIp(request, env);
  if (ipHash) {
    const allowed = await checkRateLimit(client, ipHash);
    if (!allowed) {
      return json({ error: "Too many comments. Please try again later." }, 429, headers);
    }
  }

  const id = makeId();
  const userAgent = cleanText(request.headers.get("User-Agent"), MAX_USER_AGENT_LENGTH);

  await client.execute({
    sql: `
      INSERT INTO comments (
        id, path, parent_id, author_type, display_name, body, status, author_email, ip_hash, user_agent, created_at, updated_at
      )
      VALUES (?, ?, NULL, 'visitor', ?, ?, 'pending', NULL, ?, ?, datetime('now'), datetime('now'))
    `,
    args: [id, path, name, body, ipHash || "", userAgent]
  });

  return json({ id, status: "pending" }, 202, headers);
}

async function handleAuthorAction(request, client, headers, author, id, action) {
  if (action === "approve") {
    const comment = await updateCommentStatus(client, id, "approved");
    return json({ comment: rowToComment(comment, true) }, 200, headers);
  }

  if (action === "reject") {
    const comment = await updateCommentStatus(client, id, "rejected");
    return json({ comment: rowToComment(comment, true) }, 200, headers);
  }

  const payload = await parseJson(request);
  const body = cleanMultilineText(payload.body, MAX_BODY_LENGTH);
  if (!body) {
    return json({ error: "Reply is required" }, 400, headers);
  }

  const parentResult = await client.execute({
    sql: "SELECT id, path FROM comments WHERE id = ?",
    args: [id]
  });
  const parent = parentResult.rows[0];
  if (!parent) {
    return json({ error: "Comment not found" }, 404, headers);
  }

  const replyId = makeId();
  await client.execute({
    sql: `
      INSERT INTO comments (
        id, path, parent_id, author_type, display_name, body, status, author_email, ip_hash, user_agent, created_at, updated_at
      )
      VALUES (?, ?, ?, 'author', ?, ?, 'approved', ?, '', '', datetime('now'), datetime('now'))
    `,
    args: [replyId, parent.path, parent.id, author.displayName, body, author.email]
  });

  await client.execute({
    sql: "UPDATE comments SET status = 'approved', updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
    args: [parent.id]
  });

  const replyResult = await client.execute({
    sql: `
      SELECT id, path, parent_id, author_type, display_name, body, status, author_email, created_at, updated_at
      FROM comments
      WHERE id = ?
    `,
    args: [replyId]
  });

  return json({ comment: rowToComment(replyResult.rows[0], true) }, 201, headers);
}

async function updateCommentStatus(client, id, status) {
  const result = await client.execute({
    sql: `
      UPDATE comments
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING id, path, parent_id, author_type, display_name, body, status, author_email, created_at, updated_at
    `,
    args: [status, id]
  });

  if (!result.rows[0]) {
    throw httpError("Comment not found", 404);
  }

  return result.rows[0];
}

async function checkRateLimit(client, ipHash) {
  const bucket = new Date().toISOString().slice(0, 13);
  const result = await client.execute({
    sql: `
      INSERT INTO comment_rate_limits (bucket, ip_hash, action, count, updated_at)
      VALUES (?, ?, 'create', 1, datetime('now'))
      ON CONFLICT(bucket, ip_hash, action) DO UPDATE SET
        count = comment_rate_limits.count + 1,
        updated_at = datetime('now')
      RETURNING count
    `,
    args: [bucket, ipHash]
  });

  return Number(result.rows[0]?.count || 0) <= COMMENT_RATE_LIMIT;
}

async function requireAuthor(request, env) {
  const teamDomain = normalizeAccessTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = cleanText(env.ACCESS_AUD, 512);
  const allowedEmails = parseEmailList(env.AUTHOR_EMAILS);

  if (!teamDomain || !audience || !allowedEmails.size) {
    throw httpError("Author access is not configured", 500);
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw httpError("Author sign-in is required", 401);
  }

  try {
    const jwks = getAccessJwks(teamDomain);
    const issuer = "https://" + teamDomain;
    const verified = await jwtVerify(token, jwks, {
      audience,
      issuer
    });
    const email = cleanText(verified.payload.email, 320).toLowerCase();

    if (!email || !allowedEmails.has(email)) {
      throw httpError("Author is not allowed", 403);
    }

    return {
      email,
      displayName: cleanText(env.AUTHOR_DISPLAY_NAME, MAX_NAME_LENGTH) || "Tác giả"
    };
  } catch (error) {
    if (error && error.status) throw error;
    throw httpError("Author sign-in is invalid", 401);
  }
}

function getAccessJwks(teamDomain) {
  if (!jwksCache.has(teamDomain)) {
    jwksCache.set(
      teamDomain,
      createRemoteJWKSet(new URL("https://" + teamDomain + "/cdn-cgi/access/certs"))
    );
  }

  return jwksCache.get(teamDomain);
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch (error) {
    throw httpError("Invalid JSON body", 400);
  }
}

function rowsToCommentTree(rows, includeModeration) {
  const comments = rows.map(function (row) {
    return rowToComment(row, includeModeration);
  });
  const byId = new Map();
  const roots = [];

  comments.forEach(function (comment) {
    comment.replies = [];
    byId.set(comment.id, comment);
  });

  comments.forEach(function (comment) {
    if (comment.parentId && byId.has(comment.parentId)) {
      byId.get(comment.parentId).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
}

function rowToComment(row, includeModeration) {
  if (!row) return null;

  const comment = {
    id: row.id,
    parentId: row.parent_id || null,
    authorType: row.author_type,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (includeModeration) {
    comment.status = row.status;
    comment.authorEmail = row.author_email || null;
  }

  return comment;
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
    "Access-Control-Allow-Credentials": "true",
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

function normalizeRoute(pathname) {
  const route = (pathname || "/").replace(/\/+$/, "");
  return route || "/";
}

function isCommentsRoot(route) {
  return route === "/api/comments";
}

function isAuthorRoot(route) {
  return route === "/api/comments/author";
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

function cleanMultilineText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(function (line) {
      return line.trim().replace(/[ \t]+/g, " ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function parseEmailList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map(function (email) {
        return email.trim().toLowerCase();
      })
      .filter(Boolean)
  );
}

function normalizeAccessTeamDomain(value) {
  const raw = cleanText(value, 240).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!raw) return "";
  if (raw.endsWith(".cloudflareaccess.com")) return raw;
  return raw + ".cloudflareaccess.com";
}

async function hashClientIp(request, env) {
  const ip = cleanText(
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For"),
    120
  );
  if (!ip) return "";

  const salt = cleanText(env.COMMENT_RATE_LIMIT_SALT, 512) || "duongdao-comments";
  const bytes = new TextEncoder().encode(salt + ":" + ip);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
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
