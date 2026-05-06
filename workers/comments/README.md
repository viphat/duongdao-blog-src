# Duongdao Comments Worker

Cloudflare Worker API for Turso-backed anonymous comments and author replies.

## Local Development

Use the same Turso database credentials as the analytics Worker, then run:

```sh
npm run comments:dev
```

For local Hexo development, `_config.local.yml` points the blog to:

```txt
http://localhost:8788/api/comments
```

The Worker expects these environment values:

```txt
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
ALLOWED_ORIGIN=http://localhost:4000
```

Author endpoints also require Cloudflare Access configuration:

```txt
ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
ACCESS_AUD=your-access-application-aud-tag
AUTHOR_EMAILS=author@example.com,another-author@example.com
AUTHOR_DISPLAY_NAME=Tác giả
COMMENT_RATE_LIMIT_SALT=random-long-secret
```

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `COMMENT_RATE_LIMIT_SALT` should be Wrangler secrets. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `AUTHOR_EMAILS`, and `AUTHOR_DISPLAY_NAME` may be Worker vars unless you prefer to keep them secret.

## Production

Set Worker secrets before deployment:

```sh
npx wrangler secret put TURSO_DATABASE_URL --config workers/comments/wrangler.toml
npx wrangler secret put TURSO_AUTH_TOKEN --config workers/comments/wrangler.toml
npx wrangler secret put COMMENT_RATE_LIMIT_SALT --config workers/comments/wrangler.toml
```

Deploy:

```sh
npm run comments:deploy
```

Configure a Cloudflare Worker route for:

```txt
duongdao.family/api/comments*
```

Configure a Cloudflare Access application that protects:

```txt
duongdao.family/api/comments/author*
```

## Endpoints

- `GET /api/comments?path=/some-post/`
- `POST /api/comments`
- `GET /api/comments/author?path=/some-post/`
- `POST /api/comments/author/:id/approve`
- `POST /api/comments/author/:id/reject`
- `POST /api/comments/author/:id/reply`

Anonymous request body:

```json
{
  "path": "/some-post/",
  "name": "Reader",
  "body": "A comment",
  "website": ""
}
```

The `website` field is a honeypot. If it is filled in, the Worker returns a pending-looking response without storing the comment.
