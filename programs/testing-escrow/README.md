# LionDApp testing escrow — unreleased

This Anchor 0.32.1 source is **not deployed or connected to the public app**. Its development program ID is a placeholder, not a Mainnet contract. The online API cannot prepare/confirm real escrow transactions; `onchain` mode fails closed.

## Source behavior

Configuration initialization requires the program upgrade authority. A campaign transfers the whole reward pool plus fee into a PDA-controlled SPL vault and locks a rules hash. Reservations bind a unique tester account and bounded deadlines. Report hashes, host decisions, one correction, appeal/platform resolution, settlement and close/refund have separate states. Settlement pays the specified tester and configuration fee receiver in one transaction. Refund requires no unsettled entries; paid slots cannot become new payable places.

Rewards and fees use integer units. Per-slot fee is `(reward + 9) / 10`, checked for overflow; no floating-point token accounting. The host/API model currently uses six-decimal SKR units. Mint/network/authority admission must be pinned and validated before deployment. The owner-provided fee address is `ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW`; deposits must go to the program vault, not directly to that fee address.

## Validation currently available

```sh
cargo test --locked --manifest-path programs/testing-escrow/Cargo.toml
```

This command verifies host compilation, generated ID and fee rounding/overflow only.

For compiled SBF/account/CPI validation, use the separate runtime suite:

```sh
export CARGO_BUILD_SBF=/absolute/path/to/agave-2.3.13/bin/cargo-build-sbf
export ESCROW_CARGO=/absolute/path/to/cargo
bash scripts/verify-escrow.sh artifacts/escrow-validation-local
```

Run from the repository root with Cargo/rustup on PATH. The recipe pins Agave 2.3.13 and platform-tools v1.52 (SBF Rust 1.89.0-dev), with LiteSVM 0.7.1 in a separate locked test crate. The first SBF run may download platform tools and configure the `solana` rustup toolchain. Anchor 0.32.1 requires AccountInfo 2.3; LiteSVM requires Keypair 2.2.3. Explicit test dependencies avoid incompatible older resolutions.

The script rejects stack-limit diagnostics even when the compiler exits zero, discards the tool-generated temporary keypair, and records source/lockfile/artifact checksums. Missing SBF artifacts fail tests rather than skipping them. It never deploys or accesses RPC/wallet credentials.

As of 6 October, **13 runtime cases pass** against the compiled `.so`, including real SPL Token and Associated Token Account CPIs, initialization authority, deposit rollback, fixed payout recipients, atomic payment rollback, deadlines, disputes, duplicate payment/refund and forged-account rejection. A settlement stack-limit violation was fixed using boxed account data; the wire account format and instruction layout are unchanged. See [validation report](../../docs/escrow-validation-2026-10-06.md).

This is local runtime evidence, not public-network, real SKR or mobile-wallet acceptance. The packaged Agave syscall allowlist is empty and produces a post-processing warning; the named syscalls execute successfully in the recorded LiteSVM tests. Keep that compiler warning in evidence rather than treating the build as warning-free.

On 7 October, the [security review](../../docs/security-review-2026-10-07.md) added
three attack regressions and an explicit refund account inequality. **16 runtime
cases pass** against the rebuilt SBF. The new cases also pass against the original
SBF, demonstrating the original authority/owner/CPI constraints already reject
the reported attacks. This does not clear remaining host-toolchain advisories or
prove public-network readiness.

## Required before paid launch

1. Establish the network, actual program ID, dedicated deployment/upgrade authority and backed-up key management outside the repository.
2. Rerun SBF/account/CPI tests for the final owned program identity/configuration, broaden cases when implementation changes, and verify against the selected public cluster before real funds. The present isolated test suite does not verify deployed identity, actual SKR admission or RPC confirmation behavior.
3. Deploy and initialize the reviewed program configuration, verifying canonical Mainnet SKR Mint/decimals if Mainnet is chosen. A Devnet token is test data, not real SKR.
4. Implement an unsigned transaction API and MWA review/signing for the entire paid lifecycle. Store/reconcile confirmed chain transitions; do not let D1-only transitions counterfeit real approval, release or payment.
5. Test simulation failure, cancellation, account changes, lost confirmations/recovery, exact reward+fee payout and refunds on Seeker before enabling the public gate.

See [current project status](../../docs/project-status.md) and [deployment](../../docs/deployment.md). No private keys or deployment keypairs are supplied by this directory.
