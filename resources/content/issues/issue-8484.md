---
id: 8484
title: 'Optimize uploadKnowledgeBase script: Early Exit and Robust Cleanup'
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T21:18:15Z'
updatedAt: '2026-01-09T21:22:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8484'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T21:22:24Z'
---
# Optimize uploadKnowledgeBase script: Early Exit and Robust Cleanup

`buildScripts/uploadKnowledgeBase.mjs` needs two improvements:

1.  **Cleanup Logic:** The current `finally` block might not execute if the process exits early via `process.exit(1)` inside the catch block. We should ensure the zip file is always cleaned up, even on failure. The `process.exit(1)` calls should likely be removed or moved to the end, or we should use a more robust cleanup mechanism (like listening for exit events or just restructuring the flow).
2.  **Execution Order:** The script currently creates the large zip file *before* checking if the GitHub release exists. This is inefficient. We should check for the existence of the release tag on GitHub first. If the tag is missing, we should abort immediately without spending time and disk I/O creating the zip.

**Proposed Flow:**
1.  Check if `chroma-neo-knowledge-base` exists locally.
2.  Check if the target release tag exists on GitHub.
3.  Zip the knowledge base.
4.  Upload to GitHub.
5.  Cleanup (delete zip).

## Timeline

- 2026-01-09T21:18:16Z @tobiu added the `enhancement` label
- 2026-01-09T21:18:16Z @tobiu added the `ai` label
- 2026-01-09T21:18:16Z @tobiu added the `build` label
- 2026-01-09T21:19:30Z @tobiu assigned to @tobiu
- 2026-01-09T21:20:50Z @tobiu referenced in commit `1135f12` - "refactor: Optimize uploadKnowledgeBase flow and cleanup (#8484)"
- 2026-01-09T21:22:00Z @tobiu referenced in commit `7ac2ba2` - "fix: Ensure zip cleanup runs by deferring process.exit (#8484)"
### @tobiu - 2026-01-09T21:22:08Z

**Input from Gemini 3 Pro:**

> ✦ I have applied a critical fix to the script logic. `process.exit(1)` inside the `catch` block would terminate the process immediately, bypassing the `finally` block and leaving the zip file behind.
> 
> I replaced this with an `exitCode` variable that is checked at the very end of the function, ensuring that the cleanup logic in `finally` always executes before the process terminates.
> 
> Fix applied and pushed to `dev`.

- 2026-01-09T21:22:24Z @tobiu closed this issue

