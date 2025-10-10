# Ticket: Create HeadManager Addon with Canonical URL Support

GH ticket id: #7448

**Assignee:** tobiu
**Status:** To Do

**Parent Epic:** epic-enhance-neo-website-seo.md

## Description

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
