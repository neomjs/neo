---
id: 9743
title: Enforce path traversal boundaries for autonomous filesystem reads (DreamService)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T19:07:53Z'
updatedAt: '2026-04-06T19:08:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9743'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T19:08:30Z'
---
# Enforce path traversal boundaries for autonomous filesystem reads (DreamService)

### Description
The ReAct loop in `DreamService` natively loads raw files based on autonomous agent payloads via `fs.readFileSync`. To prevent capabilities from triggering unintended out-of-bounds reads (path traversal attacks like `../../../etc/passwd` via hallucination), we must enforce a strict resolution boundary.

### Implementation Overview
- Apply `path.relative` against the designated `neoRootDir` and the payload's `targetPath`.
- Intercept and reject any path that attempts to resolve outside the directory scope.
- Return a "Security Error" to the model loop for self-correction instead of failing silently.

## Timeline

- 2026-04-06T19:07:54Z @tobiu added the `enhancement` label
- 2026-04-06T19:07:54Z @tobiu added the `ai` label
- 2026-04-06T19:08:13Z @tobiu referenced in commit `a2694ce` - "feat: Enforce path traversal boundaries for autonomous filesystem reads (#9743)"
- 2026-04-06T19:08:27Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T19:08:29Z

Successfully added strict path traversal checks using `path.relative` to enforce boundary limits during autonomous filesystem reads. Verified and pushed to `dev`.

- 2026-04-06T19:08:30Z @tobiu closed this issue

