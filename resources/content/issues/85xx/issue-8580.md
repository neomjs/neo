---
id: 8580
title: Fix Portal Tickets 404 in production by adjusting path resolution
state: OPEN
labels:
  - bug
assignees: []
createdAt: '2026-01-12T09:38:20Z'
updatedAt: '2026-01-12T09:38:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8580'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix Portal Tickets 404 in production by adjusting path resolution

In `dist/production`, the Tickets view fails to load markdown content because the relative paths need adjustment when running inside a nested `node_modules` structure (similar to `Xhr.mjs` logic).
I will update `apps/portal/view/news/tickets/Component.mjs` to include the path adjustment logic found in `src/data/connection/Xhr.mjs`.

## Timeline

- 2026-01-12T09:38:22Z @tobiu added the `bug` label

