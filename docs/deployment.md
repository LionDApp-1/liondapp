# Deployment runbook

Updated 6 October 2026. Current resources belong to the owner's Cloudflare account. Deployments in this repository use existing resources; they do not require a registrar transfer or new domain.

## Resources and entry points

| Resource | Configuration / address |
| --- | --- |
| API Worker | `liondapp-api`, `apps/api/wrangler.toml`, https://api.liondapp.1ion.top |
| D1 | `liondapp`, migrations `0001` through `0020` in `apps/api/migrations` |
| R2 | Private bucket `liondapp-media` |
| Public Pages | `liondapp-site`, `apps/site/wrangler.toml`, https://liondapp.1ion.top |
| Admin Pages | `liondapp-admin`, `apps/admin/wrangler.toml`, https://liondapp-admin.pages.dev |
| Admin recovery | https://admin.liondapp.1ion.top, Cloudflare Access owner policy |

Both Pages projects bind `LIONDAPP_API` to `liondapp-api`. Ordinary admin login uses username/password sessions on the stable Pages hostname; setup/recovery requires a verified owner Access assertion on the protected custom hostname. Do not remove Access to make recovery easier. Never deploy admin assets into the public site directory.

The public site exposes only `GET /api/status` and `GET /api/catalog?q=` through a bounded service-binding proxy. It strips client credentials, never accepts arbitrary upstream paths/URLs, and exposes no authenticated community/admin functions. Static resources have a restrictive CSP. `_routes.json` invokes the Function only under `/api/*`.

## Local setup

```sh
npm ci
npx wrangler d1 migrations apply liondapp --local --config apps/api/wrangler.toml
npm run api:dev
```

Copy `.dev.vars.example` to `apps/api/.dev.vars`, configure secrets locally and start Pages in a separate terminal with `npm run site:dev` / `npm run admin:dev`. Use an isolated local database. Authenticated moderation and .skr verification require the configured providers; automated tests use SQLite and mocks, not production credentials.

## Safe deployment sequence

1. Check existing changes and confirm `wrangler whoami` uses the owner's account.
2. Run API/site type checks, Node tests, relevant Android checks and responsive browser checks.
3. Export remote D1 to an ignored private artifact with mode 0600 before schema changes. Verify the export without printing its rows or publishing it. A SQL export does not back up R2.
4. Apply pending migrations, deploy Worker, check health, then deploy Pages assets/functions.

```sh
npx wrangler d1 migrations apply liondapp --remote --config apps/api/wrangler.toml
npm run api:deploy
npm run site:deploy
npm run admin:deploy
```

Migration 0020 adds unfunded-draft revisions and updates the advertised Terms version to 2026-10-06. Deploy the matching Terms/Privacy pages in the same rollout. Previously deployed campaign code needs 0018/0019; do not deploy the new draft editor before 0020.

5. Verify custom and stable Pages hostnames, HTML/assets, both site API endpoints, legal/support pages and anonymous admin rejection. Record the Worker version and Pages URLs in [delivery evidence](project-status.md).
6. Keep the payment gate off. Build/install the debug package only for testing; a Store update requires original-key release signing and separate acceptance.

## Environment and secrets

Public deployment: `ENVIRONMENT=devnet`, `AUTH_CHAIN_ID=solana:devnet`, `PAYMENT_MODE=simulation`, `BOUNTY_MODE=disabled`, `DONATIONS_ENABLED=false`. Mainnet recommendation permission in D1 remains false.

`BOUNTY_FEE_RECIPIENT` records the public address provided by the owner: `ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW`. It is not an instruction to transfer a campaign deposit there. Campaign deposits must eventually go to a program-controlled vault; fee collection belongs to confirmed reward settlement.

Configure secrets interactively with `wrangler secret put NAME --config apps/api/wrangler.toml`. Required values include the abuse HMAC key and credentialed Mainnet identity RPC. Password/Access configuration is described in [operator console](security.md). Do not place credentials in TOML, Android resources, command arguments, chat or screenshots.

Mainnet identity RPC is independent of the Devnet transaction network. `.skr` resolution needs Mainnet data. There is no credentialless Mainnet fallback for Cloudflare traffic.

## Payment launch gates

Isolated bounty simulation requires all three simulation flags simultaneously. Never enable simulation for public recruitment. Real `onchain` bounty mode currently fails closed because the transaction integration is unfinished.

Before real escrow: establish deployment/upgrade authority and program ID; verify network/genesis, canonical Mint and decimals; complete SBF/account/CPI adversarial tests; deploy and initialize pinned fee/mint configuration; build and simulate exact unsigned transactions; show amount/fee/network/program/recipient before MWA approval; reconcile confirmed chain transitions and recover lost responses without duplicate payments; accept on a dedicated-wallet Seeker. Do not enable live payments just by changing a flag or supplying a fee address.

## Rollback and operations

For an asset regression, redeploy the previous reviewed site/admin directory or previous Worker version. Additive migrations should normally remain in place; do not restore a production database merely to undo a UI change. D1 point-in-time restoration can discard newer writes and requires a reviewed recovery plan. Reconcile deleted content and financial obligations before republishing restored records.

Catalog sync runs every four hours; a separate two-minute translation job observes database leases, retry backoff and AI budget. Reservations expire on campaign access/admission. Review timeouts enter the admin queue. In-app notifications are enabled; Firebase push is deferred.

Billing alerts are alerts, not hard caps. Follow [cost control](cost-control.md) and the backup tooling's private retention policy; confirm scheduling and perform isolated recovery drills rather than assuming a script guarantees disaster recovery.
