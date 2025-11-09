---
id: 7311
title: Fix MagicMoveText component cache issue causing jumping scroll
state: CLOSED
labels:
  - bug
  - no auto close
assignees:
  - tobiu
createdAt: '2025-09-30T09:59:38Z'
updatedAt: '2025-11-08T11:16:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7311'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-08T11:16:58Z'
---
# Fix MagicMoveText component cache issue causing jumping scroll

**Reported by:** @tobiu on 2025-09-30

As identified by external feedback, the `MagicMoveText` component exhibits a visual bug on the `neomjs.com` portal's home page. When the component cycles through its text, it can cause a jarring "jumping" scroll effect.

## Root Cause Analysis
The component uses a `measureCache` to store character geometries for performance. When a card is hidden (e.g., via `removeDom: true` in a card layout) and then shown again, the component's `mounted` state changes, but the cache is not being properly invalidated for the new context. This causes it to briefly render with stale positional data from its previous state, creating the jump.

## Acceptance Criteria
1.  Implement a mechanism to clear the `measureCache` within the `MagicMoveText` component when it is unmounted or hidden.
2.  The fix should be verified on the `neomjs.com` portal's home page.
3.  The "jumping" effect should be completely eliminated, resulting in a smooth transition when content changes.

