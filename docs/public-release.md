# Public release package

Updated 6 October 2026. LionDApp is a native Kotlin/Jetpack Compose Seeker community for discovery, feedback and structured testing. This public source snapshot matches the current implementation. Git history is preserved. The synchronization date is not a claim about when each feature was originally written.

## Current artifacts

- [Source](https://github.com/LionDApp-1/liondapp)
- [English Demo](https://youtu.be/JaMHQUdflUQ), actual signed release footage, English narration and captions
- [English deck](../submission/LionDApp_ClockIn_2026_Deck_EN.pptx), nine slides describing current functionality and roadmap
- [Signed APK](../submission/LionDApp-release.apk), 1.2.1 / code 4
- [Release metadata](../submission/release-1.2.1.json)
- [Build and test verification](../submission/source-verification.json)

The Store release is In Review. Store distribution and approval are pending. Free testing works. Creator-funded SKR deposits, settlement, 10% creator-paid fees and refunds are planned. Public payment gates are disabled. Compiled local escrow tests do not prove public network funding.

## Reviewer setup

Follow [README](../README.md) for prerequisites and builds. Copy the Wrangler example files to ignored local configs and use your own database/storage resources. Tests use SQLite and mocks without production credentials.

Production configuration, signing keys, credentials, private backups and user/device evidence are excluded. Development dependencies and generated outputs stay local. The release APK uses the original external certificate. Debug builds need no signing secrets.
