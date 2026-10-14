# Splitt on a VPS

Prepared configuration, not a completed deployment. Inspect the host's operating system, disk space, existing containers, ports and reverse proxy before changing it. Preserve existing applications. This deployment uses only Arc Testnet.

Use a dedicated checkout and `server/.secrets/vps.env` with permissions 600, populated from `vps.env.example`. Generate a 32-byte hexadecimal database password. The API needs the Circle TEST key/entity secret, not the owner's signing key or Circle recovery file. Configure a stable server-only model key separately; the current local Vercel OIDC token expires. Do not print `docker compose config` or environment files containing real credentials.

If ports 80/443 are free, point the API subdomain's DNS to the VPS, open those ports, and use the optional Caddy profile:

```sh
docker compose --env-file server/.secrets/vps.env -f compose.vps.yaml config --quiet
docker compose --env-file server/.secrets/vps.env -f compose.vps.yaml --profile tls up -d --build
curl --fail https://YOUR_API_DOMAIN/health
```

If the VPS already has an HTTPS reverse proxy, omit `--profile tls` and route the API subdomain to `127.0.0.1:4400`. PostgreSQL has no published host port; the API's host port binds only to loopback. Caddy's persistent volume retains certificates. Container logs rotate. Docker restarts long-running services after reboot; database migrations must complete before the API starts. Run one worker for this vault; stop the local worker before activating the cloud worker.

After health verification, set `SPLITT_API_URL=https://YOUR_API_DOMAIN` on Vercel and rebuild the web app. Check the `/api/auth/session` response through the web origin, signed owner login, chain-derived balances, and approved metadata registration. Only then disable `NEXT_PUBLIC_DEMO_ONLY` and redeploy. Owner signatures remain in the browser; the VPS cannot authorize payments itself. Fresh databases do not import local project metadata or queued jobs automatically. Inspect local pending jobs before migration; never copy or rebuild an unresolved intent blindly.

Before changes, back up PostgreSQL to a private file (it contains sessions and signed intents):

```sh
umask 077
mkdir -p server/.secrets/backups
docker compose --env-file server/.secrets/vps.env -f compose.vps.yaml exec -T postgres pg_dump -U splitt -d splitt > server/.secrets/backups/splitt.sql
```

Retain encrypted off-host backups and verify a restore to a separate database. For rollback, stop the API worker, restore the previous application revision, rebuild and start it against the existing volume. Do not remove volumes or replay payments while an intent remains unresolved. This runbook does not establish a VPS backup schedule or prove restart recovery; record those checks after deployment.
