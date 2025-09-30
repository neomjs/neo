# Ticket: Fix MagicMoveText component cache issue causing jumping scroll

GH ticket id: #7311

**Assignee:** 
**Status:** To Do

## Description
As identified by external feedback, the `MagicMoveText` component exhibits a visual bug on the `neomjs.com` portal's home page. When the component cycles through its text, it can cause a jarring "jumping" scroll effect.

## Root Cause Analysis
The component uses a `measureCache` to store character geometries for performance. When a card is hidden (e.g., via `removeDom: true` in a card layout) and then shown again, the component's `mounted` state changes, but the cache is not being properly invalidated for the new context. This causes it to briefly render with stale positional data from its previous state, creating the jump.

## Acceptance Criteria
1.  Implement a mechanism to clear the `measureCache` within the `MagicMoveText` component when it is unmounted or hidden.
2.  The fix should be verified on the `neomjs.com` portal's home page.
3.  The "jumping" effect should be completely eliminated, resulting in a smooth transition when content changes.
