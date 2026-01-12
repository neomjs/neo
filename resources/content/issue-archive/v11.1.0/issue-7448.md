---
id: 7448
title: Create DocumentHead Addon with Canonical URL Support
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:09:36Z'
updatedAt: '2025-11-11T10:59:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7448'
author: tobiu
commentsCount: 2
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T10:59:35Z'
---
# Create DocumentHead Addon with Canonical URL Support

To solve the critical duplicate content issue caused by the SPA architecture and multiple deployment environments (dev, prod, esm), a main thread addon is required to dynamically manage the document's `<head>`.

This is the highest priority task for the SEO epic, as it enables crawlers like Google to correctly index our content by providing a canonical URL.

## Acceptance Criteria

1.  Create a new main thread addon at `src/main/addon/DocumentHead.mjs`.
2.  The addon must expose the following RMA methods:
    -   `setTitle(newTitle)`: Updates the content of the `<title>` tag.
    -   `setTag(tagObject)`: A smart method that creates or updates a `<meta>` or `<link>` tag. It should remove any existing tag with the same `name` or `property` before adding the new one.
    -   `setCanonical(url)`: A dedicated method that creates or updates the `<link rel="canonical" href="...">` tag.
3.  The `portal` application controller (`apps/portal/view/ViewportController.mjs`) must be updated to:
    -   Listen for route changes.
    -   On route change, call the `HeadManager` addon's methods to update the title, meta description, and, most importantly, the canonical URL for the new route.

## Timeline

- 2025-10-10T20:09:36Z @tobiu assigned to @tobiu
- 2025-10-10T20:09:37Z @tobiu added the `enhancement` label
- 2025-10-10T20:09:37Z @tobiu added the `ai` label
- 2025-10-10T20:09:37Z @tobiu added parent issue #7446
### @22Yash - 2025-10-17T14:36:47Z

@tobiu I would like to work on this issue!

I understand this is a high-priority SEO task requiring the creation of a Main Thread Addon to dynamically manage the document <head> content, specifically to fix the duplicate content issue by setting the canonical URL.

My plan is:
1.  **Implement `src/main/addon/HeadManager.mjs`:** Implement the `setTitle`, `setTag` (with logic to find/remove duplicates by `name`/`property`/`rel`), and `setCanonical` methods, ensuring all are accessible via RMA (Remote Method Access).
2.  **Integrate in `ViewportController.mjs`:** Implement the logic in `apps/portal/view/ViewportController.mjs` to listen for route changes and call the new `HeadManager` methods (especially `setCanonical`) to update the head metadata for the new route.

Please assign this to me. Thank you!

- 2025-11-11T09:02:04Z @tobiu changed title from **Create HeadManager Addon with Canonical URL Support** to **Create DocumentHead Addon with Canonical URL Support**
### @tobiu - 2025-11-11T09:11:14Z

@22Yash sorry, missed your comment. the v11 release was insane. since this was already last month, i will tackle this one on my own.

- 2025-11-11T09:11:49Z @tobiu referenced in commit `0d13b56` - "#7448 base class"
- 2025-11-11T09:12:20Z @tobiu referenced in commit `6cd886c` - "#7448 class name"
- 2025-11-11T09:52:07Z @tobiu referenced in commit `9134cf4` - "#7448 getCanonical, getTag, setCanonical, setTag, Portal.view.ViewportController WIP"
- 2025-11-11T10:30:14Z @tobiu referenced in commit `e721456` - "#7448 Portal.view.ViewportController"
- 2025-11-11T10:45:28Z @tobiu referenced in commit `1dc41c6` - "#7448 main.addon.DocumentHead: getLdJson, setLdJson"
- 2025-11-11T10:56:19Z @tobiu referenced in commit `d1417ee` - "#7448 main.addon.DocumentHead: refactoring & cleanup"
- 2025-11-11T10:59:21Z @tobiu referenced in commit `72c5260` - "#7448 main.addon.DocumentHead: intent driven JSDoc comments"
- 2025-11-11T10:59:35Z @tobiu closed this issue

