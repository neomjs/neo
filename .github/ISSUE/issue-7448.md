---
id: 7448
title: Create HeadManager Addon with Canonical URL Support
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:09:36Z'
updatedAt: '2025-10-17T14:36:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7448'
author: tobiu
commentsCount: 1
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Create HeadManager Addon with Canonical URL Support

**Reported by:** @tobiu on 2025-10-10

---

**Parent Issue:** #7446 - Enhance SEO for Neo.mjs Website

---

To solve the critical duplicate content issue caused by the SPA architecture and multiple deployment environments (dev, prod, esm), a main thread addon is required to dynamically manage the document's `<head>`.

This is the highest priority task for the SEO epic, as it enables crawlers like Google to correctly index our content by providing a canonical URL.

## Acceptance Criteria

1.  Create a new main thread addon at `src/main/addon/HeadManager.mjs`.
2.  The addon must expose the following RMA methods:
    -   `setTitle(newTitle)`: Updates the content of the `<title>` tag.
    -   `setTag(tagObject)`: A smart method that creates or updates a `<meta>` or `<link>` tag. It should remove any existing tag with the same `name` or `property` before adding the new one.
    -   `setCanonical(url)`: A dedicated method that creates or updates the `<link rel="canonical" href="...">` tag.
3.  The `portal` application controller (`apps/portal/view/ViewportController.mjs`) must be updated to:
    -   Listen for route changes.
    -   On route change, call the `HeadManager` addon's methods to update the title, meta description, and, most importantly, the canonical URL for the new route.

## Comments

### @22Yash - 2025-10-17 14:36

@tobiu I would like to work on this issue!

I understand this is a high-priority SEO task requiring the creation of a Main Thread Addon to dynamically manage the document <head> content, specifically to fix the duplicate content issue by setting the canonical URL.

My plan is:
1.  **Implement `src/main/addon/HeadManager.mjs`:** Implement the `setTitle`, `setTag` (with logic to find/remove duplicates by `name`/`property`/`rel`), and `setCanonical` methods, ensuring all are accessible via RMA (Remote Method Access).
2.  **Integrate in `ViewportController.mjs`:** Implement the logic in `apps/portal/view/ViewportController.mjs` to listen for route changes and call the new `HeadManager` methods (especially `setCanonical`) to update the head metadata for the new route.

Please assign this to me. Thank you!

