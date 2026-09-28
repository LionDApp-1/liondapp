# API contract

Base URL: `https://api.liondapp.1ion.top`

## Public

- `GET /health`
- `GET /v1/config`
- `GET /v1/search?q=`
- `GET /v1/store-apps?q=&limit=`
- `GET /v1/store-apps/:androidPackage`
- `GET /v1/needs?sort=latest|needed|discussed`
- `GET /v1/needs/:id`
- `GET /v1/works?sort=latest|liked|discussed`
- `GET /v1/works/:id`
- `GET /v1/{needs|works}/:id/comments?sort=top|latest`
- `GET /v1/announcements`
- `GET /media/:key`

Public reads may use a valid bearer session to apply the caller's block list.
If an attached session has expired or been revoked, the API ignores it for the
public read and responds as an anonymous request. This fallback never applies to
the authenticated write and account endpoints below.

## Authentication

- `POST /v1/auth/challenge`
- `POST /v1/auth/verify`
- `POST /v1/auth/logout`

All write endpoints below require `Authorization: Bearer <session>` from a verified, active `.skr` identity.

JSON request bodies are limited to 32 KiB. Current media uploads send one static
WebP file, up to 2 MiB, as a raw `image/webp` request body. This avoids
cross-runtime multipart boundary incompatibilities and unnecessary multipart
overhead. The Worker temporarily accepts the earlier multipart shape during the
Devnet transition. Both forms pass through the same signature, animation, and
metadata sanitation before private R2 storage. Oversized requests return `413
request_too_large` before application parsing.

Public text submitted through needs, works, comments, and profile biographies
is checked by the same server-side content policy. Rejected submissions return
`400 content_not_allowed` and are not published or stored. Moderation telemetry
does not retain the rejected text or matched phrase.

## Community writes

- `POST /v1/needs`
- `POST /v1/works`
- `POST /v1/{needs|works}/:id/comments`
- `POST /v1/{needs|works|comments}/:id/reaction`
- `POST /v1/reports`
- `POST /v1/media`
- `DELETE /v1/{needs|works|comments}/:id`
- `GET /v1/me`
- `DELETE /v1/me`
- `GET /v1/notifications`
- `GET /v1/blocks`
- `POST /v1/blocks/:skr`
- `DELETE /v1/blocks/:skr`

`POST /v1/works` does not accept an APK URL or Store deep link. A work is
identified by its dApp name and requires three to six images: one icon followed
by two to five screenshots.

## Recommendations

- `POST /v1/works/:id/promotion-order`
- `POST /v1/promotion-orders/:id/simulate-confirm` — Devnet simulation mode only.

The Mainnet transaction-preparation and confirmation endpoints are intentionally not exposed until their production gate is implemented and accepted.

## Administration

Protected `/admin/*` routes require a valid owner password session or Cloudflare Access JWT for `plus1ionczp@gmail.com`. `/admin/auth/status` is public; login is throttled. Setup/recovery requires Access even when a password session exists. Password-session mutations require an allowed Origin and `x-liondapp-admin: 1`.

- `GET /admin/overview`
- `GET /admin/config`
- `GET /admin/needs`
- `GET /admin/works`
- `POST /admin/works/:id/review`
- `GET /admin/comments`
- `GET /admin/reports`
- `GET /admin/moderation-events`
- `GET /admin/users`
- `GET /admin/promotions`
- `GET /admin/audit`
- `GET /admin/announcements`
- `DELETE /admin/announcements/:id`
- `GET /admin/store-catalog/status`
- `POST /admin/reports/:id/resolve`
- `POST /admin/{needs|works|comments}/:id/remove`
- `POST /admin/identities/:skr/block`
- `POST /admin/identities/:skr/unblock`
- `PUT /admin/config/recommendation-price`
- `POST /admin/announcements`
- `POST /admin/store-catalog/sync`

`/v1/search` returns `needs`, `works`, and `storeApps`. Only `storeApps` contains
only public metadata sourced from the official Solana dApp Store; its
`store_url` is always a `solanadappstore://details?id=<package>` deep link.


## Paid development and private messages (2026-09-16)

`POST /v1/needs` additionally accepts `requestType: "free" | "paid_development"` and `budgetSkr` (whole integer 1–1,000,000,000 for paid requests). Omitted type is free. Budgets are statements of intent, never verified funds. All need feed sorts and need search results prioritize paid requests by budget, then the selected secondary sort.

All conversation endpoints require a session; conversation and message IDs are not authorization.

- `POST /v1/conversations` `{needId}`: start or retrieve the developer's conversation with that need's author. No self-contact, hidden need, inactive account or blocked contact.
- `GET /v1/conversations?before=...`: 50 recent conversations, `nextCursor`, per-user unread counts. Cursor is opaque to clients.
- `GET /v1/conversations/:id/messages?before=seq`: up to 50 messages in chronological order, `nextCursor` for older messages. Only participants may access history.
- `POST /v1/conversations/:id/messages` `{body,clientId}`: 1–2,000 characters; stable client-generated retry ID; rules + AI review before delivery; 20 attempts/minute. Membership, active accounts and bidirectional blocking are checked again when the database inserts.
- `POST /v1/conversations/:id/read` `{lastSeq}`: monotonic cursor limited to a message in this conversation.
- `DELETE /v1/conversations/:id/messages/:messageId`: author-only withdrawal; both participants see a tombstone.
- `POST /v1/conversations/:id/messages/:messageId/report` `{reason}`: participant-only report of another sender; 5 attempts/minute, deduplicated per reporter/message.
- `GET /admin/message-reports`, `POST /admin/message-reports/:id` `{decision:"removed"|"dismissed"}`: Authenticated administrator only. Returns reported messages, not full conversations; actions are audited.

Account deletion withdraws outgoing messages. Unremoved messages have no TTL. Removed bodies are cleared after 30 days unless an open report requires evidence. Completed message reports are retained for 180 days.

## Voluntary project tips (gated)

- `GET /v1/donations/config`: enabled flag, pinned project receiver and SKR Mint, mainnet network.
- `POST /v1/donations/quote` `{amountSkr}`: authenticated; integer 1–1,000,000; mainnet genesis + Mint owner/decimals check; unsigned ATA-idempotent + TransferChecked + unique memo; simulation; fee and account rent estimates; 60-second review expiry.
- `POST /v1/donations/:quoteId/confirm` `{signature}`: only donor and quoted wallet; `pending|failed|confirmed`. Confirmation uses `getTransaction` with finalized commitment and exact prepared message bytes plus cryptographic signatures. It works after quote expiry and when new payments are disabled. Does not broadcast.

`DONATIONS_ENABLED=false` by default. Debug cannot sign tips. Release must additionally be built with `LIONDAPP_DONATIONS_ENABLED=true`. Mainnet wallet acceptance is required before enabling. Tips never create project orders or paid ranking. Existing recommendation purchases remain simulation-only; the incomplete onchain recommendation confirmation route fails closed with `promotion_onchain_not_ready`.

### Operator tip readiness

`GET /admin/donations/readiness` requires the same administrator session or Access JWT and administrator
identity as other operator routes. It checks Mainnet genesis and the canonical
SKR Mint owner/layout/decimals. The response contains `enabled`, `rpcReady`,
`network`, `mintAddress`, `receiverAddress`, `decimals`, and `checks`; it never
contains an RPC URL or credentials. This is not wallet/payment acceptance and
performs no database write, quotation, simulation, or transfer.

Tip RPC selection is `DONATION_RPC_URL` first, then the existing
`IDENTITY_RPC_URL_SECRET`. There is no public RPC fallback; missing or non-HTTPS
configuration keeps new tips unavailable. Reconciliation of existing receipts
remains available while the new-tip switch is off, provided the RPC is usable.

## Administrator credentials and translation

- `GET /admin/auth/status`: authenticated, accessVerified, configured, consoleUrl. No credentials returned.
- `POST /admin/auth/setup`: username/password; verified Access owner only; replaces credentials and revokes previous sessions.
- `POST /admin/auth/login`: username/password/remember; HttpOnly session cookie, never a JSON bearer token.
- `POST /admin/auth/logout`: revokes current cookie session.
- `POST /admin/store-catalog/translate`: processes the next three eligible entries.
- `POST /admin/store-catalog/translation-control`: `{enabled:boolean,retryFailed?:boolean}`; pauses/resumes and optionally clears retry state.
- Catalog status includes `translation_enabled` and `translation_failed`.
- `/v1/config` includes `catalog: {active, translated}` for catalog coverage reporting. The homepage search hint uses “1,000+” per the owner’s UI preference.
- Serialized works include `public_visibility` (`visible`, `hidden_policy`, `not_published`) independently of the original `moderation_status`; owners retain access to their hidden records.
