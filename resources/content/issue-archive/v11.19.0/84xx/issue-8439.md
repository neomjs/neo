---
id: 8439
title: Update SEO Service for Nested Routes and News Section
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T19:48:26Z'
updatedAt: '2026-01-08T19:54:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8439'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T19:54:39Z'
---
# Update SEO Service for Nested Routes and News Section

- Update `apps/portal/resources/data/seo.json` to reflect the new `news` structure (`/news`, `/news/blog`, `/news/releases`).
- Refactor `apps/portal/service/Seo.mjs` to support nested route lookups (fallback to parent path if exact match is missing).
- Ensure `/news/blog/postId` falls back to `/news/blog` metadata.


## Timeline

- 2026-01-08T19:48:28Z @tobiu added the `enhancement` label
- 2026-01-08T19:48:28Z @tobiu added the `ai` label
- 2026-01-08T19:48:35Z @tobiu added parent issue #8362
- 2026-01-08T19:51:29Z @tobiu referenced in commit `da15721` - "feat: Update SEO Service for nested routes (#8439)"
- 2026-01-08T19:52:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T19:54:19Z

**Input from Gemini 3 Pro:**

> ✦ Implemented nested route support in `Seo.mjs` and updated `seo.json` to include new News structure.

- 2026-01-08T19:54:39Z @tobiu closed this issue

