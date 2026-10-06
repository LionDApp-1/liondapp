# Cost control

Last checked: 6 September 2026.

## Cloudflare R2 answer

R2 is not unconditionally free. The account dashboard currently offers:

- 10 GB-month Standard storage free each month;
- 1 million Class A operations free each month;
- 10 million Class B operations free each month;
- zero egress fees for R2;
- `$0.00` due now and `$0.00 + additional usage` monthly.

Enabling it creates an automatically renewing, usage-billed subscription. Charges
can occur when usage exceeds the included allowance. LionDApp has reached the
secure billing form but has not completed activation or incurred R2 usage.

## Implemented cost limits

- Needs accept at most three images.
- Works require one icon and two to five screenshots (three to six images total).
- Android downsamples images and re-encodes them as WebP before upload, stripping
  metadata and targeting no more than 2 MiB per image.
- The API accepts only WebP, caps the full request before multipart parsing,
  strips metadata again, rejects animation and excessive dimensions, and stores
  no more than 2 MiB per image.
- A `.skr` identity can perform at most twelve image uploads per minute.
- Immutable media is cached at the Cloudflare edge, so repeated views do not
  generate an R2 Class B read on every request.
- Deleted-content media is removed by scheduled retention cleanup after 30 days.
- LionDApp does not host APKs; it stores only product media and links to the Store.
- Firebase push delivery remains disabled until actual usage justifies it.

## Operator controls before public launch

- The Cloudflare account budget alert `LionDApp minimum spend alert` is enabled
  at the dashboard minimum of `$0.01` for `plus1ionczp@gmail.com`.
- Complete R2 billing activation privately. Treat the alert as early warning,
  not a hard spending limit.
- Review R2 storage and operation counts weekly during the first month.
- Keep the Worker on the free plan unless measured traffic requires a change.
- Do not enable paid analytics or image transformation without a separate review.
- Keep Mainnet payment disabled until transaction verification is complete.

Cloudflare billing alerts are warnings, not a guaranteed hard spending cap. If a
hard zero-cost ceiling is required, launch without image uploads; that materially
reduces the quality of the Works experience and is not the current product plan.

## Solana dApp Store costs

The current official submission guide recommends keeping approximately `0.2 SOL`
in the publisher wallet for transactions and ArDrive upload costs. This is an
estimate, not a fixed fee. Use the Publisher Portal cost estimator immediately
before funding and upload only the final compressed APK/assets.

The accepted identity RPC baseline is the Helius Free plan. At the time of
selection it is `$0/month`, includes 1 million credits, and is limited to 10
requests per second. Monitor credits and failures; do not authorize an automatic
paid upgrade without the owner's approval. Optional Firebase usage remains a
potential later cost and has not been purchased for LionDApp.

## Chinese catalog translation

Three apps are processed per scheduled batch, every two minutes, with a ten-minute lease, one-hour failure backoff and three attempts before manual retry. The operator can pause processing. Cached translations are reused until source text changes. The Qwen3-30B-A3B FP8 model lists $0.0509/M input tokens and $0.335/M output tokens (Cloudflare docs checked 17 September 2026); these are unit prices, not a purchased plan or guaranteed total. Catalog length, retries, other Workers AI usage and account quota determine duration/cost. The existing free/paid account limits still apply, and no paid-plan upgrade was authorized or performed. Monitor Workers AI usage alongside moderation, since they share account resources.
