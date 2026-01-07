---
id: 8362
title: Refactor Portal 'Blog' to 'News' with Left-Tab Architecture for Releases & Posts
state: OPEN
labels:
  - documentation
  - epic
assignees:
  - tobiu
createdAt: '2026-01-06T14:50:50Z'
updatedAt: '2026-01-07T14:39:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8362'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8386 Refactor Portal Blog to News Section with Tabbed Interface'
subIssuesCompleted: 1
subIssuesTotal: 1
blockedBy: []
blocking: []
---
# Refactor Portal 'Blog' to 'News' with Left-Tab Architecture for Releases & Posts

Refactor the Portal's "Blog" section into a comprehensive "News" (or "Updates") center to prepare for SEO indexing and better content discovery.

**Objectives:**
1.  **Rename & Rebrand:**
    *   Rename the top-level "Blog" section to "News" (or similar).
    *   Update routing and navigation (`HeaderToolbar`, `Viewport`) to reflect this change.

2.  **Architectural Change (Tabbed Layout):**
    *   Replace the current single-view `blog/Container.mjs` with a `Neo.tab.Container` configured with `tabBarPosition: 'left'` (similar to `examples/TabContainer.mjs`).
    *   This allows for multiple content categories.

3.  **Content Tabs:**
    *   **Tab 1: Blog**
        *   Preserve the existing Blog functionality (Search + List).
        *   Refactor the current `blog/Container.mjs` to be an item within the new TabContainer.
    *   **Tab 2: Release Notes**
        *   Create a new view to display Release Notes.
        *   Implement a data store (`apps/portal/store/Releases.mjs`) to fetch release metadata (likely from a JSON index, similar to `blog.json`).
        *   Render release notes (potentially parsing the Markdown files from `.github/RELEASE_NOTES/` or using a pre-generated JSON summary).

**Strategic Value:**
This structure prepares the Portal for the upcoming Middleware deployment (SSR/SSG+), ensuring that high-value content like Release Notes is accessible, indexable, and organized alongside Blog posts.

## Activity Log

- 2026-01-06 @tobiu added the `documentation` label
- 2026-01-06 @tobiu added the `enhancement` label
- 2026-01-06 @tobiu assigned to @tobiu
- 2026-01-07 @tobiu removed the `enhancement` label
- 2026-01-07 @tobiu added the `epic` label
- 2026-01-07 @tobiu cross-referenced by #8386
- 2026-01-07 @tobiu added sub-issue #8386

