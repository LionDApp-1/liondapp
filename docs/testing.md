# Testing

Run the comprehensive local API, schema, security, and packaging checks after
Node dependencies are installed:

```bash
bash scripts/verify.sh
```

This includes API contract and exact-unit tests, an in-memory D1/SQLite migration,
single-use challenge enforcement, promoted/natural list separation,
counter-trigger behavior, bounded request parsing, WebP metadata sanitation,
Pages security headers, Worker type checking/dry-run bundling, Android XML
parsing, and a basic secret scan.

For individual API/database checks:

```bash
npm run api:typecheck
npx wrangler d1 migrations apply liondapp --local --config apps/api/wrangler.toml
```

On this development Mac, the verification wrapper locates the installed JDK 17
and Android SDK without changing global shell settings:

```bash
bash scripts/android-verify.sh
```

Before declaring a release candidate, run the skill preflight:

```bash
bash /Users/cuizepengdemac/.codex/skills/solana-mobile-dapp-developer/scripts/preflight.sh /Users/cuizepengdemac/Documents/dapp撮合平台
```

Then complete `docs/release-checklist.md` on a physical Seeker.

The current skill preflight also checks for an Expo `app.json`. LionDApp is a
native Kotlin project, so that single failure is not applicable. Do not add a
fake Expo configuration to silence it; use the Gradle, APK, signer, and physical
device evidence required for the native Android path.

The preflight warning about a missing release APK is expected until the owner
creates and backs up the dedicated release signing key. The Devnet APK is signed
with Android Debug and must never be submitted.

Lint also calls `mipmap-anydpi-v26` unnecessary because `minSdk` is 26. The
version qualifier is intentionally retained: AAPT requires adaptive-icon XML to
remain API-qualified even when all supported devices are API 26 or newer.
