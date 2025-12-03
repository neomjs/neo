---
id: 8017
title: Fix IssueSyncer path resolution for Antigravity environment
state: OPEN
labels:
  - bug
  - contributor-experience
  - ai
assignees: []
createdAt: '2025-12-03T23:00:33Z'
updatedAt: '2025-12-03T23:00:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8017'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix IssueSyncer path resolution for Antigravity environment

The `sync_all` tool was failing in the Antigravity environment due to `process.cwd()` resolving to `/`. This caused the `IssueSyncer` to attempt creating directories at the filesystem root (e.g., `/.github`), resulting in `ENOENT` errors.

**Changes:**
- Updated `ai/mcp/server/github-workflow/config.mjs` to use a hybrid path resolution strategy.
- The configuration now calculates the package root using `import.meta.url`.
- If `process.cwd()` is `/` (Antigravity), it falls back to the package root.
- Otherwise, it uses `process.cwd()` to maintain compatibility with standard workspace scripts.

**Verification:**
- Verified that `sync_all` runs successfully in Antigravity after the fix.

## Activity Log

- 2025-12-03 @tobiu added the `bug` label
- 2025-12-03 @tobiu added the `contributor-experience` label
- 2025-12-03 @tobiu added the `ai` label

