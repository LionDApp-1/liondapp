# Security model

## Wallet authentication

1. The app authorizes with official Mobile Wallet Adapter and obtains a public address.
2. The API issues a single-use, five-minute SIWS-formatted challenge bound to `liondapp.1ion.top`, the public address, nonce, issuance, and expiry.
3. Seed Vault Wallet signs the exact UTF-8 challenge.
4. The API verifies exact message equality and Ed25519 signature before resolving `.skr`.
5. The API performs reverse address-to-domain and forward domain-to-address checks on Mainnet.
6. A random bearer token is returned; only its SHA-256 hash is stored. Sessions expire after 24 hours and are revoked on sign-out, account deletion, or block.

Wallet authorization never implies transaction authorization.

## Recommendation payment invariants

- Official SKR Mint only: `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`.
- Recipient only: `ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW`.
- Price is a positive whole SKR amount read from server configuration and snapshotted into an order.
- Base units use integer arithmetic. `SKR_DECIMALS` must be verified from the Mint account during production readiness.
- Only the author of an approved, non-deleted, non-active work can create an order.
- A promotion starts only after transaction verification confirms Mint, source owner, recipient, amount, finality, and unused signature.
- Mainnet execution fails closed when any expected field, RPC response, simulation, or production gate is missing.

The current Devnet baseline contains an explicitly isolated simulation confirmation endpoint. It is unavailable in on-chain mode.

## Content and media

- Input length and list bounds are enforced server-side.
- A shared Worker-side text policy checks needs, works, comments, and profile
  biographies before storage. Unicode compatibility normalization, invisible
  control removal, and compact matching catch common full-width, spacing, and
  punctuation bypasses.
- High-confidence sexual exploitation, illegal trade or criminal instruction,
  violent extremist, political campaigning or violence, hate recruitment, and
  wallet-secret solicitation phrases fail closed with `content_not_allowed`.
  Ordinary civic-product terms are not blocked merely because they mention a
  government or voting feature.
- Rejected text and matched phrases are not retained. D1 stores only the `.skr`
  identity, publishing surface, policy category, and timestamp for 180 days.
- The API accepts only the WebP format produced by the Android image pipeline,
  with a 2 MiB file limit and a slightly larger bounded multipart envelope. It
  validates the RIFF/chunk structure, rejects animation and oversized decoded
  dimensions, strips EXIF/XMP/ICC metadata, and stores only the sanitized bytes.
- Solana dApp Store URLs are allowlisted; other external links require a user confirmation surface.
- Questions and feedback can be edited only by their author with moderation and an exact revision; earlier versions are retained. Published campaign terms cannot be changed through post editing. Only private unfunded reward drafts are editable. Soft deletion preserves discussion/audit consistency until retention cleanup.
- Basic `.skr` rate limits: one post per minute, one comment per ten seconds, one reaction per second, and up to twelve image uploads per minute.
- Authentication challenges and verification also use a daily rotating HMAC of
  the connecting address. Raw IP addresses are never stored in D1, and the HMAC
  key exists only as a Cloudflare secret.
- Authenticated users can block another `.skr`; feeds, search, details, profiles,
  and comments then hide that author's content for the blocker.
- Android downsamples and re-encodes selected media as WebP before upload to
  reduce storage, bound decoded dimensions, and strip embedded metadata.
- Keyword screening is a baseline, not a semantic guarantee. User reporting,
  operator review, removal, identity blocking, and appeals remain required.

## Secrets

Never commit Seed phrases, private keys, RPC credentials, Firebase credentials, Cloudflare API tokens, Access secrets, release keystores, or passwords. Use Cloudflare secrets, Firebase project controls, and an external password manager. Keep the release keystore outside this repository with an offline backup.

`IDENTITY_RPC_URL_SECRET` contains the credentialed Mainnet RPC endpoint used for
`.skr` resolution. It must exist only as a Cloudflare Worker secret. It must not
be placed in `wrangler.toml`, Android resources, an APK, logs, screenshots, chat,
or Git. The public Solana Mainnet RPC rejects Cloudflare Worker traffic and is
not an availability fallback.

## Known gates before Mainnet

- Implement and test unsigned SPL transfer preparation plus on-chain verification.
- Confirm SKR decimals directly from the canonical Mint.
- Configure `ABUSE_HASH_KEY` as a random Cloudflare secret before deployment.
- Configure `IDENTITY_RPC_URL_SECRET` as a credentialed Mainnet RPC Cloudflare secret.
- Push delivery is deferred; do not advertise it while credentials and token handling are absent.
- Complete security review and physical Seeker tests.

## Dependency review (7 October 2026)

The [security report response](security-review-2026-10-07.md) records the reviewed
snapshot, fixes, false positives and residual Rust toolchain work. Current npm
audit reports zero findings after upgrading Wrangler/web3 and applying reviewed
Jayson/sharp overrides. RPC compatibility and rendering regressions pass.
Rust maintenance/version advisories remain explicitly tracked; they are not
covered by npm's result. Reassess dependency reachability and compatibility on
every SDK or feature change. This maintainer review is not a third-party safety
certification and does not authorize enabling real funds.

# Official catalog boundary

The official dApp Store catalog is public discovery metadata, not user content.
The Worker calls only the fixed Solana Mobile GraphQL host, uses request
timeouts and bounded pagination/batches, never stores APK or install-file URLs,
and constructs outbound links from the Android package. Sync failures do not
clear existing data. App feedback and campaigns link to catalog apps but remain separate community data; they never rewrite official ratings or reviews.

## Testing and public-site boundaries (6 October 2026)

Capacity and wallet/identity uniqueness are enforced in the same SQL admission statement. Unsettled results and appeal holds cannot be refunded. Optimistic transitions create audit/notification only for a successful mutation; stale decisions return 409. Free completion contains no fabricated transaction signature. Public unfunded drafts are hidden, including cancelled drafts. Existing enrolled testers retain access when the host or linked post is hidden. Account deletion is restricted while obligations remain.

The public deployment uses `BOUNTY_MODE=disabled`. Simulation requires Devnet plus both simulation flags. Positive-reward creation does not transfer tokens or publish a funded campaign. The Anchor source has a compiled SBF artifact and 16 passing isolated LiteSVM account/CPI tests after this review, including partial-payment rollback, refund alias, ProgramData owner and CPI-target rejection; see [review](security-review-2026-10-07.md) and [original evidence](escrow-validation-2026-10-06.md). It remains undeployed and is not a live custody service. Real SKR transaction construction, confirmed-chain reconciliation and MWA recovery are still required. An operator must not turn on a flag to bypass these missing steps.

The public site only proxies anonymous GET status/catalog requests, discards client credentials, uses fixed internal targets and caps results at 12. Store text is inserted with `textContent`, not `innerHTML`. No wallet authentication or write capability exists on the website. Admin uses a separate Pages deployment, authenticated service binding and CSRF checks.
