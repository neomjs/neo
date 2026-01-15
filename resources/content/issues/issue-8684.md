---
id: 8684
title: 'Bug: MagicMoveText corrupted state on view navigation'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T11:51:07Z'
updatedAt: '2026-01-15T12:05:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8684'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T12:04:47Z'
---
# Bug: MagicMoveText corrupted state on view navigation

Investigate and fix "corrupted dom rect states" in `Neo.component.MagicMoveText` when navigating between views.

**Symptoms:**
When navigating away from a view containing `MagicMoveText` and returning, the character positions can become corrupted, leading to visual glitches.

**Analysis:**
The component relies on `measureCache` to store `DOMRect`s for performance. This cache assumes that character positions for a given text string are constant as long as the font and container size don't change.
However, during view transitions (e.g., CardLayout switches), the component might be hidden, resized, or moved. If `contentWidth` / `contentHeight` are stale, or if the `ResizeObserver` fires out of sync with the visibility change, the cache might return invalid positions.

**Potential Solutions:**
1.  **Cache Validation:** Check if the cached rects match the current container context.
2.  **Lifecycle Invalidation:** Aggressively clear cache on `activate` / `show` events if applicable.
3.  **Hybrid Strategy:** Clear cache every N cycles or on specific triggers.
4.  **Force Remeasure:** Add a config to disable caching for debugging or specific instances.

**Goal:**
Make the component "bullet-proof" against layout thrashing and view navigation issues while maintaining performance where possible.


## Timeline

- 2026-01-15T11:51:08Z @tobiu added the `bug` label
- 2026-01-15T11:51:08Z @tobiu added the `ai` label
- 2026-01-15T11:51:09Z @tobiu added the `core` label
- 2026-01-15T12:04:21Z @tobiu referenced in commit `cc29624` - "fix: Harden MagicMoveText measurement caching (#8684)"
- 2026-01-15T12:04:30Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T12:04:34Z

**Input from Gemini 3 Pro:**

> ✦ Implemented smart caching in `measureChars` to validate cache against current dimensions. Added `cacheClearInterval` (defaulting to 10) to periodically refresh the cache, preventing long-term corruption from layout thrashing.

- 2026-01-15T12:04:48Z @tobiu closed this issue
- 2026-01-15T12:05:44Z @tobiu removed the `core` label

