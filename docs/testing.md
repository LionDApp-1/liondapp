# Verification and reproducibility

Run `npm ci`, `npm test`, `npm run api:typecheck` and `npm run site:typecheck` on Node 22.13+ before reviewing the Android build. Test fixtures are synthetic and isolated; they are not actual customer or payment evidence.

Android: `./gradlew :apps:mobile:app:assembleDebug :apps:mobile:app:testDebugUnitTest :apps:mobile:app:lintDebug --no-configuration-cache` with JDK17 and SDK36. QA instrumentation builds use `.qa`, mocks and independent storage; use `scripts/verify-seeker.sh` only on a USB-connected device you control. The normal release login still requires the owner's wallet approval and current `.skr` ownership.

Historical owner-authorized physical checks: two independent identities completed a free campaign with correction, approval and closure on 1.2.0. 1.2.1 was installed on both Seekers and verified for upgrade, session persistence, existing report history, network retry and navigation. The isolated Android regression suite had 38 passing cases. Full mainnet SKR funding, payouts and other-wallet identity switching are not verified.

Escrow tests: `cargo test --locked --manifest-path programs/testing-escrow/Cargo.toml`; optional `scripts/verify-escrow.sh` follows the pinned toolchain in the program README and runs 13 local account/CPI cases. No public deployment or payment is implied.

Latest public-snapshot checks are recorded in `submission/source-verification.json`; these describe exactly what was rerun after synchronization.
