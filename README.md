# LionDApp

A native Solana Seeker community for **discovering dApps, sharing real experiences and organizing dApp testing**. Builders recommend apps, publish testing requirements and review reports. Users share issues, suggestions and praise, follow discussions, and join free testing invitations.

English is the default. Chinese makes the interface more accessible to Seeker users who are less comfortable with English. Community posts retain their original language. LionDApp is an independent project, not an official endorsement or verified-developer registry.

## Release 1.2.1

Current signed APK: **1.2.1 / versionCode 4**, package `top.oneion.liondapp`. Submitted to the Solana dApp Store on 6 October 2026, **In Review**. Store approval and public Store distribution are pending.

- [Website](https://liondapp.1ion.top/)
- [Download signed APK](https://raw.githubusercontent.com/LionDApp-1/liondapp/main/submission/LionDApp-release.apk)
- [142-second English Demo](https://youtu.be/JaMHQUdflUQ)
- [English Clock In deck — PDF on Google Drive](https://drive.google.com/file/d/1vEWopU-mHC__0-Ke_nfcpXYhCleA83RF/view)
- [PDF mirror](submission/LionDApp_ClockIn_2026_Deck_EN.pdf) · [Editable PPTX](submission/LionDApp_ClockIn_2026_Deck_EN.pptx)
- [Current status and verification](docs/project-status.md)
- [Public release metadata](submission/release-1.2.1.json)

APK SHA-256: `f5781a084fbc55d6b28682afd6500048664ee5ec58ed71a0561e93e790892cf3`.

## What works and what is planned

| Capability | State |
| --- | --- |
| Store catalog search, app-specific feedback, community projects/questions, follows, comments and replies | Implemented |
| Private messages, in-app notifications, reporting, blocking and moderation | Implemented |
| Free testing campaigns, atomic capacity reservation, dedicated reports, one correction, review, appeals and platform resolution | Implemented |
| Private reward drafts | Implemented, editable before funding |
| Creator-funded SKR reward deposit, payout, fee and refund | Planned, live funds disabled |
| Anchor testing escrow source | SBF artifact and 13 isolated account/CPI tests pass, not deployed |
| X engagement tasks and push notifications | Deferred |

The planned model is **net tester reward plus an additional 10% creator-paid platform fee**, deposited in full before recruitment. Fees use exact integer SKR units. A public comment is not a testing report. A suggested development budget is not funded escrow. `.skr` ownership verification is distinct from SKR token payments and does not certify that an author officially represents an app.

## Source layout

- `apps/mobile/app`: Kotlin/Jetpack Compose Android, MWA/SIWS, English/Chinese UI.
- `apps/api`: Cloudflare Worker, D1 migrations, R2, catalog, moderation and testing lifecycle.
- `apps/admin`: operator console and authenticated service-binding proxy.
- `apps/site`: responsive bilingual website, catalog search, legal/support pages and fee estimator.
- `programs/testing-escrow`: unreleased Anchor escrow and isolated runtime tests.
- `packages/core`, `tests`: shared validation, exact-unit accounting and API/SQLite regressions.
- `submission`: signed APK, deck and public release metadata.

This is a reviewed public source snapshot. Signing keys, passwords, RPC credentials, production database/storage identifiers, backups and private account/device evidence are excluded. Development history is preserved. The 6 October source update records the current implementation; its commit date is not represented as the date every feature was first written.

## Build and test

Use Node.js **22.13+** (tests use `node:sqlite`), npm, **JDK 17** and **Android SDK 36**.

```sh
npm ci
npm test
npm run api:typecheck
npm run site:typecheck
```

Build Android from the repository root:

```sh
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=/path/to/android-sdk
./gradlew :apps:mobile:app:assembleDebug :apps:mobile:app:testDebugUnitTest :apps:mobile:app:lintDebug --no-configuration-cache
```

Debug uses `top.oneion.liondapp.dev`. QA uses an isolated `.qa` package, mock API and separate storage. The default client API URL points to the deployed service. Signed release builds require the original external keystore and `--no-configuration-cache`; never commit signing values. Reviewer debug builds need no signing secrets.

Local Cloudflare development uses your own resources:

```sh
cp apps/api/wrangler.example.toml apps/api/wrangler.toml
cp apps/site/wrangler.example.toml apps/site/wrangler.toml
cp apps/admin/wrangler.example.toml apps/admin/wrangler.toml
cp apps/api/.dev.vars.example apps/api/.dev.vars
npx wrangler d1 migrations apply liondapp-local --local --config apps/api/wrangler.toml
npm run api:dev
```

Replace template resource placeholders and configure providers locally. Moderation and `.skr` ownership resolution require configured services. Tests use SQLite and mocks without production credentials. Run `npm run site:dev` or `npm run admin:dev` in another terminal. Live bounty payments and donations remain disabled by default.

Escrow checks are optional and separate from the app:

```sh
cargo test --locked --manifest-path programs/testing-escrow/Cargo.toml
```

See [escrow source instructions](programs/testing-escrow/README.md) for pinned Agave/SBF and isolated LiteSVM cases. They do not submit transactions to a public network.

## Documentation

[Architecture](docs/architecture.md) · [Product scope](docs/product-scope.md) · [API](docs/api.md) · [Security](docs/security.md) · [Deployment](docs/deployment.md) · [Testing](docs/testing.md) · [Release checklist](docs/release-checklist.md) · [Submission description](docs/hackathon-submission-draft-en.md)

All payment claims must match the disabled public payment gates. Catalog text, user opinions, author-reported outcomes and platform review are distinct sources of information.
