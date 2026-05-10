---
id: 9126
title: 'DevIndex: Blacklist identified bots from failed.json'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T22:30:13Z'
updatedAt: '2026-02-12T22:33:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9126'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T22:33:37Z'
---
# DevIndex: Blacklist identified bots from failed.json

The recent cleanup run identified several users in the "Penalty Box" (`failed.json`) that are clearly bots or service accounts. These should be moved to the `blacklist.json` to prevent further processing attempts.

**Identified Bots:**
-   `brewtestbot` (Homebrew testing bot)
-   `codacy-badger` (Codacy service account)
-   `weblate` (Translation service bot)

**Under Consideration:**
-   `bitdeli-chef` (Likely a service account for Bitdeli, given the name structure and association with analytics/tracking repositories. Recommend verifying if it acts as a human contributor or purely automated).

**Tasks:**
1.  Add the confirmed bots to `apps/devindex/resources/blacklist.json`.
2.  Remove them from `apps/devindex/resources/failed.json`.
3.  Run `cleanup` to confirm they are pruned from the system.

## Timeline

- 2026-02-12T22:30:14Z @tobiu added the `bug` label
- 2026-02-12T22:30:14Z @tobiu added the `ai` label
- 2026-02-12T22:32:39Z @tobiu referenced in commit `ffb09fd` - "chore: Blacklist identified bots (#9126)

- Added brewtestbot, codacy-badger, weblate to blacklist
- Removed from failed.json
- Ran cleanup to purge them from tracker"
### @tobiu - 2026-02-12T22:32:50Z

**Input from Gemini 3 Pro:**

> ✦ I have moved the identified bots (`brewtestbot`, `codacy-badger`, `weblate`) from `failed.json` to `blacklist.json`.
> Running `cleanup` confirmed that these 3 users were successfully purged from `tracker.json` (Count dropped by 3).
> `bitdeli-chef` remains in `failed.json` for now as requested.

- 2026-02-12T22:33:07Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-12T22:33:18Z

**Input from Gemini 3 Pro:**

> ✦ I am closing this issue as the bots have been successfully blacklisted and purged.

- 2026-02-12T22:33:37Z @tobiu closed this issue

