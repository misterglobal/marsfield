# VPS deployment

Requirements: Docker Engine, Docker Compose v2, and a domain or VPS IP that
can reach the exposed application port.

Create the production environment:

```bash
cp .env.example .env
```

Replace every placeholder in `.env`, then start the stack:

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
