# Duongdao Analytics Worker

Cloudflare Worker API for Turso-backed anonymous page view counters.

## Local Development

Create Turso credentials, then run:

```sh
npm run analytics:dev
```

For local Hexo development, `_config.local.yml` points the blog to:

```txt
http://localhost:8787/api/analytics
```

The Worker expects these environment values:

```txt
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
ALLOWED_ORIGIN=http://localhost:4000
```

## Production

Set Worker secrets before deployment:

```sh
npx wrangler secret put TURSO_DATABASE_URL --config workers/analytics/wrangler.toml
npx wrangler secret put TURSO_AUTH_TOKEN --config workers/analytics/wrangler.toml
```

Deploy:

```sh
npm run analytics:deploy
```

The production blog uses `/api/analytics` by default. Configure a Cloudflare Worker route for `duongdao.family/api/analytics*`, or change `analytics.api_base` in `_config.yml` if the Worker lives on a separate hostname.

## Endpoints

- `POST /api/analytics/pageview`
- `GET /api/analytics/summary?path=/some-post/`

The request body stores only anonymous aggregate page data:

```json
{
  "path": "/some-post/",
  "title": "Some post",
  "pageType": "post"
}
```

The response shape is:

```json
{
  "path": "/some-post/",
  "views": 123,
  "totalPageViews": 4567
}
```
