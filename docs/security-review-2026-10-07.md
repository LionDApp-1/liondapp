# Security report response — 7 October 2026

The JavaScript dependency findings have been remediated, admin rendering has been hardened, and the unreleased escrow now explicitly rejects aliased refund accounts. This is a maintainer review with reproducible regression evidence, **not an independent security certification**. The APK remains 1.2.1 / versionCode 4. Real SKR payments remain disabled.

## Reviewed snapshot and scope

The advisory report covers `c3151af6e839e9448e10484819000178cf3f0730`, with 45 source candidates, 15 dependency packages and four informational notes. It expressly says “Nothing was confirmed as a defect in the code that was reviewed.” Its portal also reports incomplete checks and provides no score. This response does not imply the external scanner has audited subsequent commits.

The original report SHA-256 is `15cb0b0c642fcd1012f9f8cfc9107b4b0f4a5ffc8f37c67e96eb163d6b531b44`. The complete numbered disposition is in the [Chinese review](security-review-2026-10-07-zh.md).

## Changes and dependency verification

- Update Wrangler to 4.148.0 and web3.js to 1.99.0.
- Override Miniflare's sharp to 0.35.5. The report's 0.35.4 recommendation misses a newer librsvg advisory, [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Undici now resolves to 7.29.1.
- Override Jayson to 5.0.0, removing its obsolete stream-json and uuid dependencies. The browser-client source comparison preserves the request/callback contract; regression tests verify actual web3 RPC success/error, generated IDs, notifications, batches, invalid JSON, and unsigned transaction serialization. This avoids an unverified stream-json major-version substitution.
- Fix an additional real bug outside the report: Mainnet genesis validation used a truncated chain reference. Use the full `getGenesisHash` value, correct the mock and add full-hash acceptance/truncated-hash rejection coverage. The old implementation rejected valid Mainnet endpoints; payment gates remain closed.
- Escape project-type attributes, convert progress counts to numbers and escape interpolated user-count text. Those API fields originate in SQL constants/aggregates; the changes remove unnecessary trust in that upstream typing rather than establish an existing user-controlled exploit.
- Add an explicit refund destination/vault inequality constraint, preserving the existing wire layout. Add three SBF attack cases.

Current `npm audit` reports **zero** findings, down from ten dependency nodes (four high and six moderate). This does **not** mean Rust advisories are zero. The overrides are intentional; future SDK upgrades must rerun compatibility tests.

## Source candidates: corrections and evidence

| Report IDs | Disposition |
| --- | --- |
| 1–23: admin HTML sinks | The source already escapes user text/IDs, validates external URL protocols, encodes media paths and formats numbers. The three remaining defensive changes above are covered by English/Chinese rendering tests. Tests execute actual render functions and parse generated HTML for executable tags, event attributes and unsafe URLs. These are not a full browser/penetration assessment. See the complete per-sink table in the Chinese review. |
| 24–25: random authorities/unpacking | These occur in isolated LiteSVM fixtures and balance assertions, not callable escrow instructions. |
| 26: backup SQL | Interpolated identifiers come from a constant five-table allowlist; no external table-name input. SQL parameters cannot bind identifiers. No demonstrated injection path. |
| 27: leaked secret | The match is an explicitly synthetic test pepper for an in-memory SQLite test, not a provider/production credential. |
| 28–32: external screenshots | Android instrumentation fixtures, isolated `.qa` package and mock data, excluded from the release APK. App-scoped external storage is also distinct from a public shared root. Do not reuse this fixture pattern for sensitive real-account screenshots without review. |
| 33: exported activity | Required MAIN/LAUNCHER activity; it does not dispatch arbitrary intent data to wallet signing or transfers. Disabling export would break normal launch. |
| 34–37: arithmetic | Bounded fixture constants in runtime tests; not unchecked production token arithmetic. |
| 38–39: stale Campaign after CPI | CPI target is pinned by `Program<Token>`; SPL Token cannot modify an escrow-owned Campaign. Cached vault data is not read after a transfer for settlement. Existing atomic rollback checks pass. An added attack test rejects substitute CPI targets on both the original and updated SBF. |
| 40: refund alias | Original constraints require different token authorities (campaign PDA versus creator signer), already rejecting a shared account. Confirmed against original SBF; the new explicit inequality makes the invariant clearer. |
| 41–43: web3 v1 | Migration advice, not proof of a defect. Patched v1 and reviewed RPC override retained for TldParser compatibility. Kit migration remains a separate compatibility change. |
| 44: reinitialization | Matched a fixture instruction builder. Config/campaign use `init`; repeat initialization is rejected by the runtime suite. Constrained receipt ATAs alone use `init_if_needed`. |
| 45: owner check | Anchor `Account<ProgramData>` checks loader ownership/type; its address is bound to this program, and the handler requires its upgrade-authority signer. A forged-owner runtime case is rejected by the original SBF too. |

## Rust dependencies and residual work

Dependency scope was verified for both locked host manifests **and the `sbf-solana-solana` target**. A lockfile entry alone does not prove it ships in an APK or is reachable in the program. Reported Rust packages are mainly transitive, not direct dependencies.

| Package | Disposition |
| --- | --- |
| borsh 0.10.4 | Version false positive: [RustSec RUSTSEC-2023-0033](https://github.com/RustSec/advisory-db/blob/main/crates/borsh/RUSTSEC-2023-0033.md) explicitly lists `^0.10.4` as patched. GitHub/OSV's broader alternate range can incorrectly match this patched branch. |
| rand 0.7.3 | Host/test dependency, absent for SBF. No log feature enabled for this version in either feature tree; [RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097.html)'s conjunctive trigger is not met. The version was not upgraded or suppressed. |
| bincode 1.3.3 | Still present for SBF and host/tests. [RUSTSEC-2025-0141](https://rustsec.org/advisories/RUSTSEC-2025-0141.html) is an unmaintained notice with no published replacement fix. Retain a compatible Anchor/Solana migration task; do not substitute incompatible protocol serialization. |
| libsecp256k1 0.6.0 | Host/test only, absent for SBF; unmaintained notice retained for toolchain migration. |
| derivative, paste, ansi_term | Runtime-suite-only macro/tool dependencies; unmaintained notices retained. |
| ed25519-dalek 1.0.1, curve25519-dalek 3.2.0 | Real cryptographic advisories, but only in the runtime suite. Tests generate synthetic keys and expose no signing oracle or real private-key service. Upgrade the compatible LiteSVM/Solana host stack before introducing such exposure. Neither old library is in the SBF target. |
| memmap2 0.5.10, atty 0.2.14 | Runtime tools only. Advisories remain; do not dismiss upstream risks solely because this project does not directly call the affected mmap methods. Current tests run on macOS, while atty's alignment issue concerns Windows. |

Residual Rust maintenance/version items are explicitly retained, **not hidden by ignore rules or fabricated lockfile changes**. Reassess on feature/SDK changes. The undeployed escrow still needs review for its final identity, configuration and real-fund lifecycle.

Three informational license notes concern the same crate's missing SPDX metadata; one concerns duplicate crate versions. They are not runtime vulnerabilities. No license has been assigned on the author's behalf; a public repository alone does not grant an MIT/Apache license.

## Validation and delivery

- Node: **132/132**, no skips. Python: **8/8**. API/site type checks pass.
- Worker dry-run compiles. API updated to final version `0f3ba998-5601-47c1-93ca-2b3c67e32b48`; admin deployed at `https://b09c33e0.liondapp-admin.pages.dev`.
- Original SBF with three new attack cases: **16/16**. The original source hash matches the audited commit.
- Updated SBF/host/runtime verification: host **2/2**, runtime **16/16**, no RPC or real token use. SBF SHA-256: `2dd6baefec0e891b4f0c1cc4daa2d7a1dfdb4421edcedfb2dd95ed10bafce475`.
- Existing dual crate-type/LTO and empty syscall-allowlist warnings remain in build evidence. The skill's Expo preflight reports missing app.json because this app is native Kotlin; its tracked signing-key and runtime .env checks pass.

Reproduce with `npm ci`, `npm test`, `npm run api:typecheck`, `npm run site:typecheck`, `npm audit`, and the pinned toolchain recipe in the [escrow README](../programs/testing-escrow/README.md). Android source/APK was not rebuilt in this change. Store distribution is independent of the still-disabled payment gate.

Chrome native health inspection confirms live payment gates remain disabled. Direct HTTP verification received 403 and the in-app browser was blocked; no WAF/authentication protection was weakened. Automated live catalog/admin-source checks were not completed. The refreshed Store release page still displays In Review.
