# Release checklist

## Build identity

- Package: `top.oneion.liondapp`
- Version name: `1.0.0`
- Version code: `1`
- MWA identity URI: `https://liondapp.1ion.top`
- Devnet chain: `solana:devnet`
- Android compile/target SDK: `36`

## Before Devnet APK

- Install JDK 17 and Android Studio/Gradle wrapper support.
- Install Node dependencies and pass API type checking/tests.
- Configure local Worker, D1, R2, and `.dev.vars` without committing secrets.
- Validate MWA connect, cancel, signature, reconnect, wallet switch, `.skr` present, and `.skr` absent paths.
- Validate English/Chinese, dark mode, long content, empty/loading/error states, and image limits on a physical Seeker.
- Confirm the Devnet build cannot reach Mainnet payment.

## Before Mainnet

- Implement unsigned SPL transfer preparation and on-chain confirmation verification.
- Verify canonical SKR Mint decimals and associated token accounts from Mainnet RPC.
- Display Mint, whole SKR amount, destination, network fee estimate, transaction count, and irreversible nature before wallet approval.
- Confirm no test-wallet allowlist and no simulation endpoint is reachable.
- Complete Terms, Privacy, Community, Support, and deletion URLs on production domains.
- Configure FCM and privacy-minimized diagnostics.
- Perform a small dedicated-wallet Mainnet transaction on a physical Seeker.

## Store release evidence

Record without secrets:

```text
APK path:
Package: top.oneion.liondapp
Version name:
Version code:
APK SHA-256:
Signer certificate SHA-256:
Build commit:
Build UTC time:
Wallet version:
Payment transaction signature:
```

Use one externally backed-up release keystore for every update. Submit a release-signed APK, not a debug APK or AAB when the current portal requires APK. Do not call a release live until its Release NFT is on-chain and the portal reports the expected distribution state.

Create the dedicated key and build without writing passwords to the repository:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/cuizepengdemac/Library/Android/sdk \
scripts/create-release-keystore-and-build.sh /absolute/path/outside/repository/liondapp-release.jks
```

The script refuses to overwrite an existing keystore. To retry a failed build or
build a later update with the same key, pass `reuse` as the second argument. The
password is entered in a native hidden macOS dialog, never as a command argument.
Before a Store update, increment versionCode and versionName.

For this owner's Mac, double-click `上架素材/构建正式APK.command`. This launcher uses
`~/Documents/LionDApp-private-signing/liondapp-release.jks`, creates it only when
absent on a first build, and reuses it when present. If a prior release archive
exists but the key is missing, it stops and asks the owner to restore the original
key. Tips are explicitly disabled in this launcher. It does not pay or upload.

After `lintRelease assembleRelease`, the script verifies the APK signer against
the selected key's public certificate, rejects the Debug signer/package, and
archives the APK, SHA-256 and `release-evidence.json` in a unique ignored
`artifacts/release-<UTC>/` folder. Evidence records the commit and whether source
changes are uncommitted. It does not claim physical acceptance or Store approval.

Owner steps and recovery instructions: [RELEASE_SIGNING_ZH.md](RELEASE_SIGNING_ZH.md).
