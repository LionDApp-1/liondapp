# LionDApp 1.2.1 English hackathon demo

The demo is 142 seconds (02:22), with English narration, embedded English captions and real Seeker footage from the release APK (1.2.1, version code 4). Delivery and verification details are recorded in the adjacent demo asset manifest after rendering.

## Narrative and timing

| Time | Purpose and evidence |
| --- | --- |
| 00:00–00:13 | Connect real experience to better dApps; actual Store catalog |
| 00:13–00:28 | Catalog scrolling, Lionance search and app details; Store facts separated from community feedback |
| 00:28–00:47 | Issue/suggestion/praise selection, independent comment sheet, unpublished English suggestion draft |
| 00:47–01:09 | Actual free QA campaign: app version, published requirements, report thresholds, completed review and a concrete issue report |
| 01:09–01:28 | Explain MWA, wallet signatures and .skr verification; distinguish account control from app representation |
| 01:28–01:46 | Actual English → Chinese → English interface switch; original post language remains unchanged |
| 01:46–02:03 | Clearly labeled SKR roadmap: full reward deposit plus separate creator-paid 10% platform fee; funding/payouts not live |
| 02:03–02:22 | Shared feedback-layer vision; listening, testing and improving release after release |

## Production source

Editable project: `media/liondapp-demo-20261006/`. `index.html` is the HyperFrames composition; `timing.json`, `captions-en.srt`, `SCRIPT-EN.md`, `edit-plan.json` and the two Python authoring scripts preserve narration and editing decisions. The project pins HyperFrames 0.8.137.

Raw files in `footage/` and UI evidence in `evidence/` are private working evidence, not a public submission bundle. The recorder only interacts with LionDApp, records actual tap/scroll sequences and keeps an action log. Edited footage removes the system status/navigation strips, preserves UI colors/aspect ratio, trims wait time, holds useful states and uses short crossfades. The narration was generated locally with Kokoro-82M (`af_nova`), sentence timings were measured, and output loudness was mastered for clear speech. There is no background music competing with the explanation.

## Truthfulness and privacy

- The QA campaign is an existing two-account acceptance test, explicitly labeled an example free test; no payment, revenue or new organic user adoption is claimed.
- The suggested Lionance feedback was entered as an unpublished demo draft and discarded after capture. No new feedback/comment/campaign was published for the video.
- Catalog ratings are Store data, not LionDApp community rating claims.
- The comment sheet is genuinely empty; no fabricated discussion or endorsements are added.
- The identity diagram explains the implemented sign-in model, without recording a new wallet approval or private inbox.
- The SKR segment is a labeled planned workflow. It does not claim deployed escrow, live funding or payouts.
- Chinese is interface accessibility support. The video does not claim automatic translation of community posts.
- The Seeker was returned to English Discover after recording.
- This video does not claim Store approval or final hackathon submission. Store release is In Review; submission deadline is **12 October 2026, 19:59 Asia/Shanghai**, per the separate official-rule recheck.

## Validation

The final composition check covers runtime, layout, motion and text contrast. Full-scene crossfade overlap is intentional. Studio-organization warnings about inline scene structure are reviewed; these are not runtime or layout failures. Actual extracted phone footage and timeline hero frames were visually reviewed, including feedback draft, published test requirements, result/report and language switch. Final MP4 metadata, decoded scene frames, duration, ending, audio stream and loudness are checked after export. The animation map covers 164 tweens: the flagged scene collisions are intentional crossfades, short caption fades are intentional, and the 142-second progress line is intentional continuous motion. No offscreen/invisible flags were reported. Technical audio measurements do not substitute for the owner's listening review of pronunciation and voice preference.

## Remaining submission work

Review the finished video, align the English deck and form with 1.2.1, provide a public video link accepted by the event, verify the repository/APK/deck links as a reviewer, and then finalize the hackathon submission with its required owner declarations. No public video upload is implied by creating the local artifact.
