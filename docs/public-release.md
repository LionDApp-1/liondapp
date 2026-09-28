# Public release package

This repository contains the reviewed source for LionDApp, a native Kotlin/Jetpack Compose Solana Mobile community app. Production account identifiers, Cloudflare secrets, signing keys, private backups and operator-only runbooks are intentionally excluded.

## Local development

- Install Node.js and run `npm ci`.
- Run `npm test` for the JavaScript test suite.
- Copy `apps/api/wrangler.example.toml` to a local-only Wrangler config and replace the D1/R2 placeholders with resources you control.
- Configure credentialed RPC and moderation bindings as local secrets. Never commit `.dev.vars`, tokens, wallet secrets or signing credentials.
- Build the Android client with the Gradle wrapper. Store release signing material outside the repository.

## Submission assets

The `submission/` directory contains the current English Clock In deck and the signed Seeker APK used for owner acceptance. Store publication and hackathon links remain subject to the owner's portal upload and review steps.
