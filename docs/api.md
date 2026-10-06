# API contract

Updated 6 October 2026.

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

`POST /v1/needs` additionally accepts `requestType: "free" | "paid_development"` and `budgetSkr` (whole integer 1–1,000,000,000 for paid requests). Omitted type is free. Budgets are statements of intent, never verified funds. Budgets do not override the selected sort; the community feed supports an explicit paid-request filter.

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
## Community feedback and testing additions

## dApp Testing Campaigns

`GET /v1/campaigns/config` exposes the bounty payment gate separately from legacy recommendations and donations. Real payments are unavailable; the config includes the owner-provided public `feeRecipient`, not a deployed escrow address. Simulation requires explicit bounty, Devnet and payment simulation gates together.

- `GET /v1/campaigns?scope=open|joined|mine&limit=30&cursor=`: open recruitment, own participation, or hosted campaigns. Private scopes require a session. Limit 1–50; responses include `nextCursor` (null at the end), ordered by creation time and ID. Pass the cursor unchanged and URL-encoded. Paid unfunded drafts, including cancelled drafts, are visible only to their creator. Disabled simulations are excluded from public recruitment.
- `POST /v1/campaigns`: `title`, `description`, `appVersion`, `requirements`, `storePackage`, `minCharacters` (20–2000), `capacity` (1–1000), `reservationHours` (1–72), `rewardSkr` (decimal string, at most 6 decimal places), `deadline` (ISO, 1 hour–30 days ahead). Zero reward publishes a free invitation; a positive reward creates an unfunded draft.
- `PUT /v1/campaigns/:id`: the creation fields plus exact `revision`. Creator-only, private/unfunded/awaiting-funding only; positive reward required. Moderation runs again; stale edits return 409. Published terms cannot be edited.
- `GET /v1/campaigns/:id`: rules, `revision`, counts, own entry, pool, fee paid, locked and unallocated units. Unfunded drafts have zero actual locked/refundable funds. Monetary values are integer strings in 6-decimal units. `GET .../entries` is host-only.
- `POST /v1/campaigns/:id/join`: reserve one slot per identity and wallet, atomically bounded by capacity; cannot join your own activity. Expiration releases reservations, never submitted or disputed results.
- `POST .../close`: stop recruitment, preserving existing participants' submission/review rights. `POST .../complete` finishes a free campaign once all entries are settled or released.
- `POST .../simulate-fund`, `.../simulate-refund`: strictly gated simulation. Refund requires closure and no unsettled reservations, results or appeal holds.
- `POST /v1/testing-entries/:id/submit`: `revision`, `body`, optional `evidenceUrl` (HTTPS). NFC-normalized character count excludes whitespace, format and control characters. Comments are separate from report submissions.
- `POST .../review`: host-only `revision`, `decision` (`approve|changes|reject`), `reason` for changes/rejection. One correction, 72-hour review deadline. Paid approval awaits settlement; free approval completes the result without a payment signature.
- `POST .../withdraw`, `.../appeal`: tester-only `revision`, plus appeal `reason`. Rejected results have a 72-hour appeal window. Overdue submissions are also eligible for platform review.
- `POST .../simulate-settle`: host-only simulation of an approved result, once, using an atomic revision guard; records a `simulation:` receipt.
- `GET /admin/testing-reviews`: authenticated admin queue of disputes and overdue submissions. `POST /admin/testing-entries/:id/resolve`: `revision`, boolean `approve`, and required `reason`; generates one audit record and participant notifications. Rejection releases the hold immediately; approval still requires settlement.

Every successful result transition generates exactly one audit event and notification under concurrent requests. Account deletion is blocked while campaign obligations remain. A blocked host is hidden publicly, but enrolled testers retain access to existing obligations. Linked campaign posts expose `campaign_id`, `campaign_reward_units`, `campaign_funding_state`, and `campaign_status`, and cannot alter locked terms through the regular post editor.

- `GET /v1/discover`: real testing/resolved/feedback/popular sections, viewer block filtering.
- `GET /v1/needs`: `kind`, `status`, `paid` filters; budgets do not override sort.
- `POST /v1/needs`: `kind=feedback`, `feedbackType=issue|suggestion|praise`, `storePackage` required for feedback; solution/audience optional.
- `PUT /v1/needs/:id`: full moderated replacement with exact `revision`; stale versions return 409, only author permitted.
- `PUT|DELETE /v1/needs/:id/follow`: `wantsTest` boolean for PUT; idempotent preference persistence.
- `GET /v1/following`, `GET /v1/following-apps`: private account subscriptions.
- `GET|PUT|DELETE /v1/store-apps/:package/follow`: own app subscription status/mutation.
- `GET /v1/store-apps/:package/feedback`: public feedback for one app, respects viewer blocks.
- `POST /v1/needs/:id/comments`: optional `responseKind`, `linkedStorePackage`, `linkedWorkId`; catalog and published-work references validated.
- `POST /v1/needs/:id/progress`: author only, `revision`, `status`, `body`, optional app/work links; atomic outcome comment and follower notification.
- `POST /v1/notifications/:id/read`: recipient only; notifications include safe navigation payloads.

All community writes use existing wallet session, moderation and rate controls. They do not verify developer affiliation. Community requires 0017, campaign review 0018/0019, and draft editing 0020. Paid settlement remains simulation-only.

## Public website proxy

The public Pages site exposes `GET /api/catalog?q=` (12 sanitized Store metadata results) and `GET /api/status` (availability, bounty mode and check time). These are website routes, not additions to the Worker base URL. No client credential, arbitrary target path or authenticated mutation is forwarded. Other API proxy paths return 404; non-GET methods return 405. See `apps/site/functions/api/[[path]].ts`.
