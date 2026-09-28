# Solana dApp Store submission package

This follows the current Publisher Portal workflow. Recheck the portal and
official documentation immediately before submission because asset dimensions,
policy, fees, and form fields can change.

## Application identity

- Name: LionDApp
- Package: `top.oneion.liondapp`
- Version name: `1.0.0` for the first release candidate
- Version code: `1`
- Website: `https://liondapp.1ion.top`
- Support: `https://liondapp.1ion.top/support/`
- Privacy: `https://liondapp.1ion.top/privacy/`
- Terms: `https://liondapp.1ion.top/terms/`
- Community rules: `https://liondapp.1ion.top/community/`
- Support email: `jackrosezuozuo@gmail.com`
- Target audience: global Seeker owners, age 18+ (owner-confirmed intent; actual availability remains subject to applicable law and Store eligibility)

## Draft listing copy

Short description:

> Discover real product needs and community-built Solana dApps.

Full description:

> LionDApp helps Seeker owners find products that solve real problems. Search
> community needs and developer works, publish an unmet need, discuss ideas, and
> react to the requests that matter. Wild Ideas offers a lighter space for
> open-ended concepts without forcing a technical solution. Developers can present dApps that are already
> available in the official Solana dApp Store. LionDApp does not host APK files,
> match developers with users, custody assets, or guarantee third-party apps.
> Community actions require a wallet signature and a valid .skr domain. Works are
> reviewed before publication, and users can report or block inappropriate content.

Reviewer walkthrough and conditional tipping instructions:
[`store-reviewer-guide-en.md`](store-reviewer-guide-en.md). Verify against the
final signed APK before submitting; the current guide explicitly records that
payments are disabled.

Category selection must use the closest category actually offered by the portal
at submission time. Do not invent a category in metadata.

## Required media and metadata

- Release-signed APK, not an AAB or debug APK.
- Final application icon.
- Portal-sized banner/feature image if the current form requires it.
- Final Seeker screenshots with one consistent portrait or landscape orientation.
- App name, short description, full description, category, website, and support.
- Public privacy, terms, community, support, and deletion information.
- Release notes in English.

Record the exact pixel dimensions and file limits shown by the current portal in
the release evidence before exporting assets. Do not rely on historical sizes.

## Android permission justification

| Permission | Reason |
| --- | --- |
| `android.permission.INTERNET` | Load community data/media, authenticate, and open Store links. |

| `android.permission.ACCESS_NETWORK_STATE` | Networking dependency connectivity checks. |
| `android.permission.REORDER_TASKS` | Mobile Wallet Adapter return flow. |

The final merged release manifest must be rechecked. Remove any permission not
needed by actual release behavior.

## Mandatory release evidence

```text
APK path:
Package: top.oneion.liondapp
Version name:
Version code:
APK SHA-256:
Signer certificate SHA-256:
Build UTC time:
Source state or commit:
Seeker model/build:
Seed Vault Wallet version:
Mainnet payment transaction signature:
Portal storage provider and cost estimate:
App NFT Mint/transaction:
Release NFT Mint/transaction:
Portal review state:
Store listing URL:
```

## Portal workflow

1. Sign up and complete publisher KYC/KYB.
2. Connect a dedicated, backed-up publisher wallet.
3. Select storage; the official guide currently recommends ArDrive.
4. Create the dApp record and mint/confirm its App NFT when prompted.
5. Add listing details and validate all media in the portal.
6. Create a version and upload the release-signed APK.
7. Review the portal cost estimate and top up only the required amount.
8. Approve every required message and transaction; skipped approvals can leave
   assets missing.
9. Confirm the Release NFT exists on-chain and retain its evidence.
10. Track review email from `publishersupport@dappstore.solanamobile.com`.

The current official guide estimates three to five business days for review.
Approval and live distribution remain separate from successful upload.

## Optional project tips — conditional first-release reviewer note

Use only when the submitted signed build actually enables tips in eligible
regions and the real-wallet acceptance evidence is recorded:

> LionDApp offers optional, one-time SKR tips to its fixed project wallet. Tips
> do not unlock features, ranking, services, investment returns or charitable
> tax benefits. Users choose the amount, review the recipient, SKR Mint and SOL
> network costs, and approve a direct transfer in their own wallet through
> Mobile Wallet Adapter. LionDApp does not hold user funds or provide payments
> between users. Community features remain available without tipping.

Do not add this as an unconditional live-feature claim yet. Regional eligibility,
release signing and Mainnet wallet acceptance remain pending. See
`TIPPING_RELEASE_REVIEW_ZH.md` for the current evidence and limitations.

17 September 2026: unused notification permission and broad website VIEW intent filter removed. Notifications are in-app only. Legal/support website links stay in the browser; no website app-link routing or assetlinks association is claimed.
