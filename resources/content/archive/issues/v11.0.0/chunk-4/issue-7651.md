---
id: 7651
title: 'Fix: `IssueSyncer` fails to find releases after `ReleaseSyncer` refactoring'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T17:47:38Z'
updatedAt: '2025-10-25T17:49:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7651'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-25T17:49:08Z'
---
# Fix: `IssueSyncer` fails to find releases after `ReleaseSyncer` refactoring

This ticket reports and resolves a bug introduced during the refactoring of `ReleaseSyncer.mjs` where `ReleaseSyncer.releases` was changed from an array to an object.

**Problem:**
After `ReleaseSyncer.releases` was refactored from an array to an object, the `IssueSyncer.#getIssuePath` method, which relies on `ReleaseSyncer.releases.find()`, started failing with the error: `ReleaseSyncer.releases.find is not a function`. This prevented the `sync_all` tool from correctly processing and archiving closed issues.

**Root Cause:**
The `IssueSyncer.#getIssuePath` method was attempting to use the `find()` array method directly on `ReleaseSyncer.releases`, which is no longer an array but an object.

**Solution:**
The `IssueSyncer.#getIssuePath` method has been updated to correctly access the values of the `ReleaseSyncer.releases` object before attempting to use the `find()` method.

**Changes Implemented:**
The following line in `ai/mcp/server/github-workflow/services/sync/IssueSyncer.mjs` was changed:
```javascript
// Old:
const release = ReleaseSyncer.releases.find(r => new Date(r.publishedAt) > closed);

// New:
const release = Object.values(ReleaseSyncer.releases).find(r => new Date(r.publishedAt) > closed);
```
This ensures that the `find()` method is called on an array of release objects, resolving the error.

## Timeline

- 2025-10-25T17:47:40Z @tobiu added the `bug` label
- 2025-10-25T17:47:40Z @tobiu added the `ai` label
- 2025-10-25T17:47:57Z @tobiu assigned to @tobiu
- 2025-10-25T17:48:52Z @tobiu referenced in commit `5586f8a` - "Fix: IssueSyncer fails to find releases after ReleaseSyncer refactoring #7651"
- 2025-10-25T17:49:08Z @tobiu closed this issue

