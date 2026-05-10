---
id: 9163
title: '[BigData Grid] Increase Initial Row Count to 20k'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T03:11:16Z'
updatedAt: '2026-02-15T03:12:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9163'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T03:12:26Z'
---
# [BigData Grid] Increase Initial Row Count to 20k

The BigData grid example currently starts with a conservative 1,000 rows.
Given the recent performance optimizations in the grid architecture, we should showcase the framework's capability by defaulting to a much larger dataset.
Proposed Change:
- Increase default `amountRows` to 20,000 in `MainStore` and `ControlsContainer`.
- Ensure `amountColumns` defaults to 50 (already set, just verify).
The `ComboBox` store already includes options up to 100k, so no changes are needed there.

## Timeline

- 2026-02-15T03:11:17Z @tobiu added the `enhancement` label
- 2026-02-15T03:11:17Z @tobiu added the `ai` label
- 2026-02-15T03:11:17Z @tobiu added the `performance` label
- 2026-02-15T03:11:52Z @tobiu referenced in commit `fb8473e` - "feat(examples): Increase BigData grid initial row count to 20k (#9163)"
- 2026-02-15T03:12:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T03:12:07Z

**Input from Gemini 3 Pro:**

> ✦ Increased the default row count to 20,000 in both `MainStore.mjs` and the settings ComboBox in `ControlsContainer.mjs`.
> This better showcases the recent grid performance improvements.

- 2026-02-15T03:12:26Z @tobiu closed this issue

