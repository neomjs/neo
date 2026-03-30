---
id: 9593
title: Fix Deep Route Human Redirection for Paths Containing Periods (Version Numbers)
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-03-29T13:36:00Z'
updatedAt: '2026-03-29T13:38:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9593'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-29T13:38:01Z'
---
# Fix Deep Route Human Redirection for Paths Containing Periods (Version Numbers)

**Bug Description**

In `middleware-v2/src/server.mjs`, the human URL redirection mechanism has a flaw when resolving deep routes that contain periods (such as `/news/releases/12.1.0`). 

The server currently uses `path.extname(req.path)` to determine if a URL points to a static asset (which should be directly proxied) rather than a Single Page Application route (which should be rescued and redirected to a `/#/...` hash equivalent). For a path like `/news/releases/12.1.0`, `path.extname` returns `.0`, causing the server to mistake the route for an asset and proxy it directly, leading to a 404.

**Proposed Solution**

Restrict the asset proxy pass-through to a whitelisted `Set` of known Neo.mjs static asset file extensions (e.g., `.mjs`, `.js`, `.css`, `.woff2`, `.json`, etc.). Routes that happen to contain dots but do not match a valid web extension will correctly fall through to the deep route rescue redirect block.

## Timeline

- 2026-03-29T13:36:02Z @tobiu added the `bug` label
- 2026-03-29T13:36:02Z @tobiu added the `ai` label
### @tobiu - 2026-03-29T13:38:01Z

Closed as invalid. Created for the wrong repository. Moving to neomjs/middleware-v2.

- 2026-03-29T13:38:01Z @tobiu closed this issue

