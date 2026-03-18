---
id: 9508
title: 'Docs: Explain Main Thread Addons and Lazy Loading in Lifecycle guide'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-18T10:19:05Z'
updatedAt: '2026-03-18T10:21:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9508'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T10:21:54Z'
---
# Docs: Explain Main Thread Addons and Lazy Loading in Lifecycle guide

The `Lifecycle.md` guide currently explains `initAsync` primarily through the lens of basic asynchronous setup and Remote Method Registration. 

This update adds a new dedicated sub-section: "Main Thread Addons & Lazy Loading". It uses `Neo.main.addon.Base` as a prime example of how `initAsync` is leveraged to pause the addon's lifecycle until heavy third-party scripts (like Mermaid or Google Maps) are fully fetched and parsed.

Crucially, it explains the developer experience benefit: because `initAsync` delays the `isReady` state, incoming remote method calls (like adding a Google Maps marker from the App Worker) are safely intercepted and queued. They are executed automatically once the script is ready, ensuring messages are never lost and preventing race conditions ("it just works").

## Timeline

- 2026-03-18T10:19:07Z @tobiu added the `documentation` label
- 2026-03-18T10:19:07Z @tobiu added the `ai` label
- 2026-03-18T10:21:11Z @tobiu referenced in commit `d8d3963` - "docs: Explain Main Thread Addons and Lazy Loading in Lifecycle guide (#9508)"
- 2026-03-18T10:21:33Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-18T10:21:53Z

Completed in d8d3963b5485d00992141e8d6976a06cffc35934

- 2026-03-18T10:21:54Z @tobiu closed this issue

