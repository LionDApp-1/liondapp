# Product scope

Updated 6 October 2026.

LionDApp connects Seeker users' experiences to actionable dApp feedback. A user can discover an existing Store app, share an issue/suggestion/praise, follow responses and participate in a clearly defined test. A builder can recommend an app, invite testers and review reports against published requirements.

## Available product surfaces

- Discovery: anonymous catalog/community search, app detail, community experiences and outcomes.
- Community: questions, wild ideas, app-specific feedback, reactions, moderated edits with retained revisions, linked suggestions and author-reported progress.
- Testing: Available/Joined/Hosted; free invitations; private reward drafts; app/version, test criteria, participant limit, reward, report length and deadline controls.
- Participation: one wallet/identity per campaign; atomic capacity reservation; bounded submission window; report/evidence submission separate from public comments.
- Review: approval, one correction or reasoned rejection; 72-hour review and appeal windows; platform queue for disputes and overdue review; notifications that return to the campaign.
- Account: verified .skr ownership, private follows/test preferences, profiles, content history, participant-only private messaging, reporting/blocking and deletion subject to unresolved testing obligations.
- Operations: password-session console for moderation, catalog/translation, announcements, projects, audit and testing resolution; Access recovery remains separate.
- Website: bilingual product presentation, public Store metadata search, exact-unit reward estimator, FAQ and legal/support pages. It does not connect wallets or submit testing reports.

English is the first-launch default. Chinese helps users who find English difficult; additional languages depend on feedback. User posts remain untranslated; cached Chinese Store descriptions are LionDApp presentation text and never rewrite official metadata.

## Paid testing decision and launch boundary

Creators predeposit all net rewards plus an additional 10% fee. Testers receive the advertised net reward; only successfully settled rewards incur fees. Unused rewards and fees are returned after closure and resolution of all holds. Fees use six-decimal integer SKR units, rounded up per slot.

Free invitations and unfunded drafts work now. Funding/settlement/refund simulation exists only behind three explicit Devnet gates. **Real SKR escrow is not available**: the Anchor source passes SBF compilation and 13 isolated account/CPI tests, but still requires deployment, unsigned transaction preparation, confirmed state reconciliation and MWA review/signing. Setting an `onchain` flag does not enable the incomplete flow.

A development budget on a community post is an author-stated intention. It is not a reward pool or escrow. Ordinary comments and the “willing to test” preference do not reserve a campaign slot or qualify for a reward. Negative feedback can meet acceptance criteria; rewards may not require praise. Published terms are immutable; unfunded private drafts are editable with a revision guard.

## Deferred scope

X engagement tasks and account verification, push delivery, Mainnet recommendation purchases, optional live tipping, automated matching, verified developer badges, app security certification, APK hosting and token issuance. In-app notifications remain available. Community projects may be discussed before Store listing, but first-phase testing selects an active Store catalog app.

## Product signals to measure

Search-to-app opening, invitations receiving substantive reports, report completion/review time, dispute frequency, issues resolved through follow-up, and return participation after external incentive campaigns end. Official recommendations and activity rewards are opportunities, not proven demand or a promised partnership.
