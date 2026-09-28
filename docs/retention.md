# Data retention and deletion

- Account deletion revokes sessions and removes the profile and authored content from public views immediately.
- Ordinary content and image backups are deleted within 30 days.
- Security, moderation, and abuse-prevention records are retained for 180 days.
- Recommendation orders and public-chain evidence are retained for two years.
- Solana transaction data and `.skr` records on public blockchains cannot be deleted by LionDApp.

The API Worker runs an idempotent cleanup every day at 03:17 UTC. It removes expired authentication and session records, expires stale quotes, deletes old notifications, removes media referenced by content deleted more than 30 days ago, and redacts that deleted content. It logs aggregate counts only and does not delete payment or audit records.

Before production, add a separate orphan-upload sweep for media that was uploaded but never attached to a post. That sweep must compare R2 object age and database references before deletion.
