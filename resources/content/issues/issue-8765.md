---
id: 8765
title: Update buildScripts/README.md to reflect new architecture
state: CLOSED
labels:
  - documentation
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T19:42:34Z'
updatedAt: '2026-01-17T19:54:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8765'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T19:54:16Z'
---
# Update buildScripts/README.md to reflect new architecture

The `buildScripts` folder has been reorganized into subdirectories (`ai`, `build`, `create`, `docs`, `helpers`, `release`, `util`). The current `README.md` is outdated and missing documentation for many scripts.

**Goal:**
Rewrite `buildScripts/README.md` to:
1.  Reflect the new folder structure.
2.  Provide documentation for all scripts in all subdirectories.
3.  Explain how to use the scripts via `npm run`.

## Timeline

- 2026-01-17T19:42:35Z @tobiu added the `documentation` label
- 2026-01-17T19:42:35Z @tobiu added the `developer-experience` label
- 2026-01-17T19:42:35Z @tobiu added the `ai` label
- 2026-01-17T19:52:50Z @tobiu assigned to @tobiu
- 2026-01-17T19:53:46Z @tobiu referenced in commit `86e8136` - "docs: Rewrite buildScripts/README.md with detailed CLI options (#8765)"
- 2026-01-17T19:53:46Z @tobiu referenced in commit `68fe893` - "docs: Rewrite buildScripts/README.md and fix creation scripts (#8765)"
### @tobiu - 2026-01-17T19:53:55Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the task.
> 1.  Rewrote `buildScripts/README.md` to reflect the new folder structure and included a detailed "CLI Reference" section.
> 2.  Fixed a regression in `buildScripts/create/*.mjs` where the path to `package.json` was incorrect due to the folder restructuring.
> 
> All changes have been pushed to `dev`.

- 2026-01-17T19:54:16Z @tobiu closed this issue
- 2026-01-17T19:57:49Z @tobiu referenced in commit `12b37ae` - "docs: Add detailed CLI Reference for all scripts to README (#8765)"

