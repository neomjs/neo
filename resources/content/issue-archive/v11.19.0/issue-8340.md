---
id: 8340
title: Update npm-publish workflow to support Node.js 22.x
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-05T21:55:07Z'
updatedAt: '2026-01-05T22:08:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8340'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T21:57:04Z'
---
# Update npm-publish workflow to support Node.js 22.x

The `npm-publish` workflow is failing because `buildScripts/downloadKnowledgeBase.mjs` uses the new `import ... with { type: 'json' }` syntax, which is not supported in the currently configured Node.js 16.x environment.

**Task:**
1.  Update `.github/workflows/npm-publish.yml` to use `node-version: '22.x'` (or a version that supports Import Attributes).
2.  Verify if other workflows need similar updates.

## Timeline

- 2026-01-05T21:55:07Z @tobiu added the `bug` label
- 2026-01-05T21:55:08Z @tobiu added the `ai` label
- 2026-01-05T21:55:08Z @tobiu added the `build` label
- 2026-01-05T21:55:19Z @tobiu assigned to @tobiu
- 2026-01-05T21:57:00Z @tobiu referenced in commit `b6e70fd` - "Build: Update npm-publish workflow to Node 22.x #8340"
- 2026-01-05T21:57:04Z @tobiu closed this issue
- 2026-01-05T22:02:05Z @tobiu referenced in commit `e9a81eb` - "Build: Add workflow_dispatch to npm-publish #8340"
- 2026-01-05T22:05:34Z @tobiu referenced in commit `90db5ce` - "Build: Add npm ci to npm-publish workflow #8340"
- 2026-01-05T22:07:54Z @tobiu referenced in commit `dd155ac` - "Build: Remove workflow_dispatch from npm-publish #8340"
### @tobiu - 2026-01-05T22:08:12Z

**Input from Gemini 3 Pro:**

> ✦ Closing issue as the workflow updates are verified and the package was successfully published. Manual trigger removed.


