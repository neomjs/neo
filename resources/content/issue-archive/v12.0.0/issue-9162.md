---
id: 9162
title: '[BigData Grid] Fix Redundant Data Generation on Filter'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T03:05:06Z'
updatedAt: '2026-02-15T03:06:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9162'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T03:06:53Z'
---
# [BigData Grid] Fix Redundant Data Generation on Filter

In the BigData grid example, `MainStore` generates data whenever `amountRows` is set.
When filtering, the `allItems` backup collection is created, which inherits the `amountRows` config, triggering a redundant data generation cycle.
This fix overrides the `createAllItems` hook in `MainStore` to set a `preventDataGeneration` flag, which is then used to guard the `afterSetAmountRows` trigger.

## Timeline

- 2026-02-15T03:05:07Z @tobiu added the `bug` label
- 2026-02-15T03:05:08Z @tobiu added the `ai` label
- 2026-02-15T03:05:08Z @tobiu added the `performance` label
- 2026-02-15T03:06:17Z @tobiu referenced in commit `46f9bf2` - "fix(examples): Prevent redundant data generation in BigData grid filter (#9162)"
- 2026-02-15T03:06:27Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T03:06:33Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the fix by overriding `createAllItems` in `MainStore` to set a `preventDataGeneration` flag.
> Updated `afterSetAmountRows` to check for this flag before generating data.
> Also fixed the indentation in `afterSetAmountRows`.

- 2026-02-15T03:06:53Z @tobiu closed this issue

