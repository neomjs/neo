---
id: 6956
title: Enhance `Neo.core.Config` with ID-based Subscriptions for Improved Debugging & Diagnostics
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-05T23:58:51Z'
updatedAt: '2025-07-06T00:23:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6956'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-06T00:23:09Z'
---
# Enhance `Neo.core.Config` with ID-based Subscriptions for Improved Debugging & Diagnostics

**Problem:**
Current `Neo.core.Config` subscriptions, especially with anonymous functions, lack clear ownership. This makes debugging challenging, as it's hard to identify which `Neo.core.Base` instance owns a specific subscription. This hinders memory leak detection and general application understanding.

**Solution:**
Modify `Neo.core.Config#subscribe` to strictly require an `id` (representing the owner's ID) and a callback `fn`. Subscriptions will be stored in an internal map (`id` -> `Set<fn>`).

**Benefits:**
*   **Enhanced Debugging:** Easily inspect `Config#subscribers` to see which `Neo.core.Base` instances are listening to a config, aiding in understanding data flow.
*   **Improved Diagnostics:** Provides a crucial diagnostic tool for tracing memory leaks or unintended subscriptions back to their source instance.
*   **Future-Proofing:** Lays the groundwork for more advanced subscription management tools and visualizations.

**Impact:**
Requires updates to `Neo.core.Base#observeConfig` and any other direct consumers of `Neo.core.Config#subscribe` to conform to the new signature.

## Timeline

- 2025-07-05T23:58:51Z @tobiu assigned to @tobiu
- 2025-07-05T23:58:52Z @tobiu added the `enhancement` label
- 2025-07-06T00:00:09Z @tobiu referenced in commit `542e84b` - "Enhance Neo.core.Config with ID-based Subscriptions for Improved Debugging & Diagnostics #6956"
- 2025-07-06T00:12:22Z @tobiu referenced in commit `1ee7782` - "#6956 core.Config cleanup"
- 2025-07-06T00:23:09Z @tobiu closed this issue

