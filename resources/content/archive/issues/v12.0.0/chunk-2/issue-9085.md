---
id: 9085
title: 'Feat: DevRank Spider Community Discovery Strategy'
state: CLOSED
labels:
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T14:20:20Z'
updatedAt: '2026-02-10T14:23:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9085'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T14:23:24Z'
---
# Feat: DevRank Spider Community Discovery Strategy

Implement a new "Community Discovery" strategy for the DevRank Spider to improve coverage of diverse developer communities and correct sampling bias.

### Features
1.  **Community Scan Strategy**: Target specific organizations (e.g., PyLadies, WomenWhoCode) to find members and contributors.
2.  **Bio Signal Strategy**: Search for users with specific bio keywords (e.g., "she/her", "woman in tech").
3.  **Strategy Rebalancing**: Update `pickStrategy` weights to include these new methods.

### Technical Details
- Add `communityTargets` list to `Spider.mjs`.
- Implement `runCommunityScan(targetOrg)` method.
- Add "Discovery: Bio Signals" search query.


## Timeline

- 2026-02-10T14:20:22Z @tobiu added the `ai` label
- 2026-02-10T14:20:22Z @tobiu added the `feature` label
- 2026-02-10T14:21:23Z @tobiu added parent issue #8930
- 2026-02-10T14:21:26Z @tobiu assigned to @tobiu
- 2026-02-10T14:22:32Z @tobiu referenced in commit `06499f1` - "feat: Implement DevRank Spider Community Discovery Strategy (#9085)

- Added 'Community Scan' strategy targeting diversity-focused organizations (15% probability).
- Added 'Bio Signals' strategy as a fallback (Bio-Keyword search).
- Updated 'pickStrategy' weights to accommodate new strategies.
- Added 'communityTargets' list (PyLadies, WomenWhoCode, etc.)."
### @tobiu - 2026-02-10T14:23:01Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the Community Discovery Strategy for the Spider.
> 
> Changes:
> 1.  **New Strategy: Community Scan (15%)**:
>     -   Targets specific organizations: `PyLadies`, `WomenWhoCode`, `RLadies`, `DjangoGirls`, `RailsGirls`, `Outreachy`, `GirlDevelopIt`, `SheCodes`, `ladies-of-code`, `womentechmakers`.
>     -   Fetches public members and contributors of their top repositories.
> 2.  **New Strategy: Bio Signals (Fallback)**:
>     -   Performs a search for bio keywords: `bio:"she/her"`, `woman in tech`, etc.
> 3.  **Strategy Rebalancing**:
>     -   Core (High Stars): 35%
>     -   Keyword: 25%
>     -   Temporal: 15%
>     -   Community: 15%
>     -   Stargazer: 10%
> 
> This implementation aims to correct sampling bias by actively exploring diverse developer clusters.

- 2026-02-10T14:23:24Z @tobiu closed this issue

