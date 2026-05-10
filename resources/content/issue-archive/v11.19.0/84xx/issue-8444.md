---
id: 8444
title: Automate .npmignore synchronization with .gitignore in prepareRelease script
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-08T21:29:43Z'
updatedAt: '2026-01-08T21:33:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8444'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T21:33:57Z'
---
# Automate .npmignore synchronization with .gitignore in prepareRelease script

Update `buildScripts/prepareRelease.mjs` to automate the synchronization of `.npmignore`.

**Logic:**
1.  Read the current `.npmignore` file.
2.  Preserve the first 7 lines (containing the specific npm-only ignore rules).
3.  Read the `.gitignore` file.
4.  Append the entire content of `.gitignore` to the preserved `.npmignore` header.
5.  Write the result back to `.npmignore`.

**Rationale:**
This ensures that `.npmignore` stays in sync with `.gitignore` automatically, preventing it from becoming stale while preserving the necessary npm-specific rules.

## Timeline

- 2026-01-08T21:29:44Z @tobiu added the `enhancement` label
- 2026-01-08T21:29:44Z @tobiu added the `ai` label
- 2026-01-08T21:29:45Z @tobiu added the `build` label
- 2026-01-08T21:30:40Z @tobiu referenced in commit `f2261ea` - "enhancement: Automate .npmignore synchronization (#8444)"
- 2026-01-08T21:30:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T21:30:52Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the synchronization logic in `buildScripts/prepareRelease.mjs`.
> 
> Changes:
> - Added logic to read `.npmignore` and `.gitignore` inside the `insideNeo` block.
> - Keeps the first 7 lines of `.npmignore` (npm specific rules).
> - Appends the full content of `.gitignore`.
> - Writes the result back to `.npmignore`.
> - Confirmed that this runs before `createReleaseIndex`.
> 
> Verified by checking the diff and committing the change.

- 2026-01-08T21:33:29Z @tobiu referenced in commit `ad416ba` - "enhancement: Use marker to sync .npmignore (#8444)"
### @tobiu - 2026-01-08T21:33:43Z

**Input from Gemini 3 Pro:**

> ✦ Refined the implementation to use a marker string `# Original content of the .gitignore file` instead of a hardcoded line count.
> - If the marker is found, it preserves everything up to and including that line.
> - If not found, it falls back to the first 7 lines.
> This approach allows for adding more npm-specific rules above the marker without breaking the script.
> 
> Changes committed and pushed.

- 2026-01-08T21:33:57Z @tobiu closed this issue

