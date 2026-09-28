# LionDApp

LionDApp is a Seeker-only, bilingual Android dApp for discovering community needs and Solana dApps published in the Solana dApp Store.

The repository contains the native Kotlin client, Cloudflare Worker API, D1 schema, operator console, public legal/support pages, and release documentation.

## Current delivery gate

This repository is the Devnet implementation baseline. Mainnet SKR payment is disabled until the physical Seeker acceptance checklist is completed and the production deployment is configured with secrets outside Git.

## Workspace

- `apps/mobile` — Kotlin + Jetpack Compose Android app, package `top.oneion.liondapp`.
- `apps/api` — Cloudflare Worker API and D1 migrations.
- `apps/admin` — static operator console shell protected by Cloudflare Access.
- `apps/site` — bilingual public site and legal/support content.
- `packages/core` — shared API and exact-unit payment rules.
- `docs` — architecture, security, operations, privacy, and release evidence.

## Non-negotiable boundaries

- The app never hosts APKs. Works link to the official Solana dApp Store listing only.
- Wallet signatures authenticate users; they do not authorize transactions without a fresh wallet approval.
- Only a wallet with a current `.skr` reverse resolution can write content.
- Mainnet payment is disabled by default. Configure it only through Cloudflare secrets and an explicit production gate.

See `docs/architecture.md`, `docs/security.md`, and `docs/release-checklist.md` before deployment.

For the current delivery state, owner actions, cost controls, and Store package,
see `docs/project-status.md`, `docs/cost-control.md`, and
`docs/store-submission.md`.
