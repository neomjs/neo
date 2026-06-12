---
id: 8799
title: Simplify MagicMoveText by removing caching and text replacement
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-19T08:52:03Z'
updatedAt: '2026-01-19T09:08:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8799'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T09:08:24Z'
---
# Simplify MagicMoveText by removing caching and text replacement

Based on performance analysis (1.5% impact), removing the complex caching logic (`useCache`, `measureCache`, `cacheClearInterval`) to improve stability and reduce code.
Also removing `replaceWithTextNode` config and logic, making the "keep spans" behavior (Hero section default) the standard. This allows for smoother subsequent animations without DOM thrashing from text-to-span conversion.

## Timeline

- 2026-01-19T08:52:05Z @tobiu added the `ai` label
- 2026-01-19T08:52:05Z @tobiu added the `refactoring` label
- 2026-01-19T08:59:02Z @tobiu assigned to @tobiu
- 2026-01-19T09:07:34Z @tobiu referenced in commit `57ef9ab` - "refactor: Simplify MagicMoveText by removing caching and text replacement (#8799)"
### @tobiu - 2026-01-19T09:07:54Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `MagicMoveText` to remove caching and text node replacement logic, simplifying the component and relying on the efficient "keep spans" behavior. Updated Portal Hero usage. Verified negligible performance impact (1.5%) vs significant stability gains.

- 2026-01-19T09:08:24Z @tobiu closed this issue

