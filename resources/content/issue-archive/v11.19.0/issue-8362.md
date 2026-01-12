---
id: 8362
title: Refactor Portal 'Blog' to 'News' with Left-Tab Architecture for Releases & Posts
state: CLOSED
labels:
  - documentation
  - epic
assignees:
  - tobiu
createdAt: '2026-01-06T14:50:50Z'
updatedAt: '2026-01-08T22:51:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8362'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8386 Refactor Portal Blog to News Section with Tabbed Interface'
  - '[x] 8388 Refactor Portal Learning Views to Shared Content Viewer'
  - '[x] 8389 Implement Releases Section using Shared Content View'
  - '[x] 8390 Implement Tree-Structured Release Index and Portal Integration'
  - '[x] 8395 Enhance Markdown parser to enforce newlines after headlines'
  - '[x] 8396 Enhance Markdown parser to support implicit readonly code blocks'
  - '[x] 8397 Add support for automatic GitHub issue linking in Markdown component'
  - '[x] 8399 Fix Deep Linking Routing in News TabContainer'
  - '[x] 8400 Fix Markdown code block trimming destroying indentation'
  - '[x] 8401 Refine Markdown inline code styling in light theme'
  - '[x] 8402 Enhance Release tree titles with dates'
  - '[x] 8403 Pass record instance to Model field convert method'
  - '[x] 8404 Add styling for Markdown hr tags'
  - '[x] 8405 Reduce sidebar width for Release view'
  - '[x] 8411 Fix Release navigation button titles showing HTML and Date'
  - '[x] 8413 Refactor Portal View Structure: Move Blog and Release under News'
  - '[x] 8439 Update SEO Service for Nested Routes and News Section'
  - '[x] 8440 Fix Mobile Layout Overlay in Portal News TabContainer'
subIssuesCompleted: 18
subIssuesTotal: 18
blockedBy: []
blocking: []
closedAt: '2026-01-08T22:51:33Z'
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

## Timeline

- 2026-01-06T14:50:51Z @tobiu added the `documentation` label
- 2026-01-06T14:50:51Z @tobiu added the `enhancement` label
- 2026-01-06T14:51:05Z @tobiu assigned to @tobiu
- 2026-01-07T14:39:26Z @tobiu removed the `enhancement` label
- 2026-01-07T14:39:26Z @tobiu added the `epic` label
- 2026-01-07T14:49:09Z @tobiu cross-referenced by #8386
- 2026-01-07T14:53:45Z @tobiu added sub-issue #8386
- 2026-01-07T15:49:39Z @tobiu added sub-issue #8388
- 2026-01-07T15:59:27Z @tobiu added sub-issue #8389
- 2026-01-07T18:11:50Z @tobiu added sub-issue #8390
- 2026-01-07T20:32:15Z @tobiu added sub-issue #8395
- 2026-01-07T20:46:32Z @tobiu added sub-issue #8396
- 2026-01-07T21:06:30Z @tobiu added sub-issue #8397
- 2026-01-07T22:28:48Z @tobiu added sub-issue #8399
- 2026-01-07T23:12:45Z @tobiu added sub-issue #8400
- 2026-01-07T23:35:57Z @tobiu added sub-issue #8401
- 2026-01-08T00:06:14Z @tobiu added sub-issue #8402
- 2026-01-08T00:06:20Z @tobiu added sub-issue #8403
- 2026-01-08T00:11:39Z @tobiu added sub-issue #8404
- 2026-01-08T00:29:42Z @tobiu added sub-issue #8405
- 2026-01-08T09:13:05Z @tobiu added sub-issue #8411
- 2026-01-08T09:40:47Z @tobiu added sub-issue #8413
- 2026-01-08T19:48:35Z @tobiu added sub-issue #8439
- 2026-01-08T20:23:12Z @tobiu added sub-issue #8440
- 2026-01-08T22:51:34Z @tobiu closed this issue

