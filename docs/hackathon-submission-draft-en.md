# Clock In Submission Draft (English)

Status: internal draft only. Do not submit until every factual answer, URL, and team detail has been checked by the owner.

## Project identity

- Project name: `LionDApp`
- Team name: `LionDApp`
- Submission type: Solo
- Team roster: No teammates
- Team representative: The participant / project owner

## Project description

LionDApp is a native Android community app for Solana Mobile Seeker users. It helps people share real product needs, discover existing Solana dApps, and give builders a clearer view of what the Seeker community wants next. Users can browse anonymously, while publishing, commenting, reacting, reporting, blocking, and profile actions use Seed Vault Wallet authentication and verified `.skr` identities. Developers can present dApps that already exist in the official Solana dApp Store without LionDApp hosting APK files or custodying assets.

## Existing project / mobile development answer

LionDApp is a native Kotlin and Jetpack Compose Android application, not a PWA wrapper. The mobile build uses Mobile Wallet Adapter and Seed Vault Wallet flows, a Seeker-specific dark interface, offline-safe draft preservation, device image preparation, wallet-based authentication, and server-side `.skr` verification. The hackathon build should identify the substantial mobile work completed after the project baseline, with Git commits and release evidence that match the actual dates.

## Major features

- Discover and search community needs, developer works, and read-only official dApp Store catalog entries.
- Publish structured needs or free-form Wild Ideas from a Seeker device.
- Submit a dApp work with an icon and screenshots for operator review.
- Comment, reply, react, report, block, and delete owned content.
- Authenticate through Mobile Wallet Adapter and Seed Vault Wallet with server-side SIWS and `.skr` ownership checks.
- Use a Seeker-first information hierarchy with dark surfaces, large touch targets, rounded cards, screenshot-led recommendations, bilingual UI, and resilient drafts.
- Apply server-side rules and Workers AI moderation before public text is written or approved.
- Distinguish free requests from paid-development requests, prioritize self-reported SKR budgets, and let participants discuss a project through private conversations without escrow or in-chat payments.
- Open public author profiles to view their published needs and developer works.

## SKR integration answer

Current baseline: LionDApp verifies `.skr` domain ownership for community identity. Paid-development budgets are expressions of intent, not on-chain payments or verified deposits. Optional project tips have a separate SKR transaction implementation, but remain disabled pending release signing, real-wallet acceptance and applicable eligibility checks. Mainnet SKR recommendation payments are also disabled and unfinished. Do not describe either payment feature as live. If tips are validated and enabled before submission, update this answer with the exact submitted behavior and transaction evidence; otherwise report identity verification, budget labels and disabled tips accurately.

## Required links (to be filled)

- Deck URL: `https://raw.githubusercontent.com/LionDApp-1/liondapp/main/submission/LionDApp_ClockIn_2026_Deck_EN.pptx`
- Demo video URL: `TBD`
- GitHub repository URL: `https://github.com/LionDApp-1/liondapp`
- Direct Android APK URL: `https://raw.githubusercontent.com/LionDApp-1/liondapp/main/submission/LionDApp-release.apk`
- APK SHA-256: `9584ee4e643dbd522b3d65db7d5d8e4df51f8bfc25966ccb433332e95e57d739`

## Factual questions requiring owner confirmation

- Did the team/project receive VC or angel funding? `No`
- Was the project started within the three-month eligibility window? `Yes` — repository history shows the first recorded project work on `2026-09-06`, which is within the eligibility window.
- Has this project previously won a hackathon? `N/A` — this is the first hackathon entry.
- Final team roster and team representative: Solo participant; no teammates.

## Three-minute demo outline

1. Start on a physical Seeker and show the home feed, search, categories, and the need-to-work discovery path.
2. Open a need and show the discussion and reaction flow.
3. Show Seed Vault Wallet sign-in and verified `.skr` identity without revealing secrets.
4. Create a need or work draft, show image selection for a work, and submit it for review.
5. Show the operator review state and the public result after approval.
6. Show report/block controls and explain that LionDApp does not host APKs or custody assets.
7. End with the Seeker dApp Store link for an official catalog app and the project value proposition.

Do not claim mainnet payments, live Store distribution, user counts, or third-party partnerships unless those facts are verified for the submitted build.
