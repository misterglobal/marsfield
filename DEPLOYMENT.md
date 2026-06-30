# VPS deployment

Requirements: Docker Engine, Docker Compose v2, and a domain or VPS IP that
can reach the exposed application port.

Create the production environment:

```bash
cp .env.example .env
```

Replace every placeholder in `.env`, then start the stack:

If `POSTGRES_PASSWORD` contains URL-reserved characters such as `@`, `:`, `/`,
`#`, `?`, or `%`, set `DATABASE_URL` explicitly in `.env` and URL-encode the
password inside that connection string.

For durable asset storage, configure Cloudflare R2 in `.env`:

```bash
R2_BUCKET_URL=https://9828e0da69ba61f88e9671219f7ffc74.r2.cloudflarestorage.com/marsfield
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BASE_URL=...
```

`R2_PUBLIC_BASE_URL` is recommended for browser playback/downloads. Use an R2
public development URL or a custom domain pointed at the bucket. If it is not
set, Marsfield stores the S3-compatible R2 object URL.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend frontend
```

The application is exposed on port `3000` by default. PostgreSQL, Redis, and
the Node API remain private on the Compose network.

The backend applies the Prisma schema during startup. PostgreSQL and Redis data
are retained in named Docker volumes.

PostgreSQL credentials are applied only when its data volume is first created.
If you change `POSTGRES_USER` or `POSTGRES_PASSWORD` later, update the existing
database role as well; changing `.env` alone does not rewrite an initialized
database.

Useful operations:

```bash
docker compose pull
docker compose up -d --build
docker compose restart backend frontend
docker compose down
```

`docker compose down` preserves data. Do not add `-v` unless you intentionally
want to delete the database and Redis volumes.

For HTTPS, place Caddy, Traefik, or Nginx in front of port `3000`. Set
`PUBLIC_APP_URL` to the final public HTTPS origin so Replicate webhooks use the
correct address.
