# Splitt on a VPS

The API and PostgreSQL are deployed in an isolated service on the existing VPS. On 17 October the API was upgraded to `selfserve-testnet` and reported healthy. Its Docker port remains loopback-only; system Caddy exposes the authenticated API through HTTPS. This deployment uses only Arc Testnet.

Public launch uses `https://splitt-api.38-49-210-22.sslip.io` temporarily while the purchased domain is not delegated in public DNS. Its separate site is `/etc/caddy/sites/splitt-api-temporary.Caddyfile`; the `api.usesplitt.xyz` site remains configured for a later switch. Vercel's production `SPLITT_API_URL` points to the verified temporary HTTPS endpoint, and `WEB_ORIGIN` remains `https://splitt-dun.vercel.app`. Public API and signed access checks passed. Do not switch the API origin to the purchased domain until its TLS and public access checks pass. This temporary DNS service is an external dependency, not a guarantee of production availability.

16 October staging: the PrepAI VPS is reachable with its existing SSH key; other applications and Caddy already own their ports. Splitt uses a separate `/opt/splitt` directory, project-local checksum-verified Compose binary and port 4400 on loopback. Do not start the optional Caddy profile on this host. The owner will supply a domain. The other saved VPS reported a changed host identity; its known_hosts entry was left untouched.

The self-serve upgrade backed up PostgreSQL privately before replacing only `splitt-api-1`. Existing PrepAI, Docent and Upside containers remained running. The original API image and settings were retained for rollback. The owner key and fresh proof-wallet keys stay on the local machine; only the Circle testnet operator credentials are hosted. `SPLITT_CONTROLLED_OWNERS` identifies the builder and both proof wallets before registration.

`scripts/prepare-vps-env.mjs` creates an exclusive, ignored minimal operator configuration from existing local testnet settings. It never includes the owner signing key or a short-lived model token. `scripts/migrate-workspace.ts` exports only financial workspace state after refusing unfinished jobs and imports into an empty, matching vault scope after integrity checks. It does not migrate authentication sessions. Keep export files private; they include execution history and signatures. Stop the local worker before exporting and before starting the VPS worker.

Use a dedicated checkout and `server/.secrets/vps.env` with permissions 600, populated from `vps.env.example`. Generate a 32-byte hexadecimal database password. The API needs the Circle TEST key/entity secret, not the owner's signing key or Circle recovery file. Configure a stable server-only model key separately; the current local Vercel OIDC token expires. Do not print `docker compose config` or environment files containing real credentials.

If ports 80/443 are free, point the API subdomain's DNS to the VPS, open those ports, and use the optional Caddy profile:

```sh
docker compose --env-file server/.secrets/vps.env -f compose.vps.yaml config --quiet
docker compose --env-file server/.secrets/vps.env -f compose.vps.yaml --profile tls up -d --build
curl --fail https://YOUR_API_DOMAIN/health
```

If the VPS already has an HTTPS reverse proxy, omit `--profile tls` and route the API subdomain to `127.0.0.1:4400`. PostgreSQL has no published host port; the API's host port binds only to loopback. Caddy's persistent volume retains certificates. Container logs rotate. Docker restarts long-running services after reboot; database migrations must complete before the API starts. Run one worker for this vault; stop the local worker before activating the cloud worker.

After health verification, set `SPLITT_API_URL=https://YOUR_API_DOMAIN` on Vercel and rebuild the web app. Check the `/api/auth/session` response through the web origin, signed owner login, chain-derived balances, and approved metadata registration. Keep `NEXT_PUBLIC_DEMO_ONLY=true` for legacy/demo routing: `/start` uses the self-serve API independently. Owner signatures remain in the browser; the VPS cannot authorize payments itself. Fresh databases do not import local project metadata or queued jobs automatically. Inspect local pending jobs before migration; never copy or rebuild an unresolved intent blindly.

## Domain handoff for this host

The owner supplied `usesplitt.xyz` on 17 October. The API host is `api.usesplitt.xyz`; its isolated site block is `api.usesplitt.xyz.Caddyfile`. Vercel's authoritative DNS answers with `38.49.210.22`, but public resolvers and direct .xyz registry queries still returned NXDOMAIN at the latest check. Vercel also reported that the purchase was too recent to determine contact-verification status.

The dedicated site is now installed at `/etc/caddy/sites/splitt-api.Caddyfile`. Existing proxy settings were backed up privately before validation and reload using the running service's environment (existing routes rely on environment substitutions). Caddy remained active; an explicit local hostname check returned HTTP 308 to the intended HTTPS host, Splitt health passed and neighboring containers remained running. Automatic certificate management is enabled, but public TLS is not verified while registration/delegation remains unpublished. Keep the existing Vercel website and API rewrite unchanged until HTTPS passes. See `api-domain-status.json`.

If the frontend is later made canonical at `https://usesplitt.xyz`, also align the API's `WEB_ORIGIN`, SIWE origin and old-host redirects before signed-in public testing. The currently configured origin remains `https://splitt-dun.vercel.app`; attaching a custom domain to Vercel alone does not update authentication policy.

Supply an API subdomain you control, then set its DNS A record to `38.49.210.22`. Avoid an AAAA record unless IPv6 on this VPS is separately confirmed. The existing system Caddy already owns ports 80/443. Add only a new site block after inspecting and privately backing up its current configuration:

```caddy
YOUR_API_DOMAIN {
  reverse_proxy 127.0.0.1:4400
}
```

This snippet belongs in the existing host proxy configuration; the repository's `Caddyfile` targets the optional container proxy and is not a replacement for the shared host configuration. Validate the merged configuration before reloading. Verify TLS, `/health` mode `selfserve-testnet`, `/selfserve/config` chain 5042002, anonymous vault access denial, and unrelated applications before changing Vercel. Inspect session cookies and CSRF using the actual frontend origin. Public endpoint checks alone do not verify wallet UI behavior or mobile usability. Do not print private environment files or place an owner signing key on the server.

Before changes, back up PostgreSQL to a private file (it contains sessions and signed intents):

```sh
umask 077
mkdir -p server/.secrets/backups
docker compose --env-file server/.secrets/vps.env -f compose.vps.yaml exec -T postgres pg_dump -U splitt -d splitt > server/.secrets/backups/splitt.sql
```

Retain encrypted off-host backups and verify a restore to a separate database. For rollback, stop the API worker, restore the previous application revision, rebuild and start it against the existing volume. Do not remove volumes or replay payments while an intent remains unresolved. This runbook does not establish a VPS backup schedule or prove restart recovery; record those checks after deployment.
