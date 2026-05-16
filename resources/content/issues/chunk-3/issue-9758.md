---
id: 9758
title: 'Fix: Centralize Hebbian Decay Physics and implement 24h Algorithmic Lock'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-07T15:29:43Z'
updatedAt: '2026-04-07T15:32:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9758'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T15:32:53Z'
---
# Fix: Centralize Hebbian Decay Physics and implement 24h Algorithmic Lock

### Problem
Currently, the Hebbian Memory Integration pipelines apply fixed geometric weight decay rigorously per execution of the Sandman pipeline. With a high ticket frequency, this strips semantic edge weights within a matter of hours, causing immediate "agent amnesia". Additionally, `DreamService.runGarbageCollection` has a redundant internal multiplier.

### Solution
- Standardize all decay mathematics to the `GraphService.decayGlobalTopology` execution, deleting the `0.9` multiplier in `DreamService`.
- Implement a rigid 24h Algorithmic Lock (`_SYSTEM_STATE.lastDecayedAt`), ensuring SQLite background global updates only execute once per day at most.
- Adjust the core `decayFactor` parameter from `0.95` to `0.98` to extend standard context retention to ~79 days.


## Timeline

- 2026-04-07T15:29:45Z @tobiu added the `enhancement` label
- 2026-04-07T15:29:45Z @tobiu added the `ai` label
- 2026-04-07T15:29:45Z @tobiu added the `architecture` label
- 2026-04-07T15:30:17Z @tobiu assigned to @tobiu
- 2026-04-07T15:32:28Z @tobiu referenced in commit `872627b` - "feat: Centralize Hebbian Decay Physics and implement 24h Algorithmic Lock (#9758)"
### @tobiu - 2026-04-07T15:32:50Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ The Hebbian Decay Physics have been successfully refactored. The `GraphService.decayGlobalTopology` execution now mathematically anchors physics to a 24-hour algorithmic lock (`_SYSTEM_STATE.lastDecayedAt`), bypassing the hyper-amnesia caused by frequent Sandman chron jobs. Redundant scaling inside Vector Apoptosis was permanently ripped out. The default decay factor was rebased to `0.98`, successfully extending geometric relationship half-life to roughly 2.5 months (79 days), optimally protecting active sprint volumes (10-15 tickets/day).

- 2026-04-07T15:32:53Z @tobiu closed this issue

