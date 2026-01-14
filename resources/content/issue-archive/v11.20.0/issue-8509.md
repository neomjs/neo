---
id: 8509
title: 'Optimization: Minify Indices and Prune Release Model'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - build
assignees:
  - tobiu
createdAt: '2026-01-10T16:59:25Z'
updatedAt: '2026-01-10T17:06:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8509'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T17:06:23Z'
---
# Optimization: Minify Indices and Prune Release Model

To reduce the file size of the generated data indices for the Portal App:

1.  **Minify JSON Output:** Update `buildScripts/createTicketIndex.mjs` and `buildScripts/createReleaseIndex.mjs` to remove indentation (`spaces: 4`) when writing the JSON files.
2.  **Prune Release Data:** Remove the `title` property from the generated release objects in `buildScripts/createReleaseIndex.mjs` as it is not needed for the side navigation.
3.  **Update Release Model:** Remove the `title` field from `apps/portal/model/Release.mjs` to match the data structure.

This is a sub-task of #8398.

## Timeline

- 2026-01-10T16:59:26Z @tobiu added the `enhancement` label
- 2026-01-10T16:59:26Z @tobiu added the `ai` label
- 2026-01-10T16:59:26Z @tobiu added the `performance` label
- 2026-01-10T16:59:26Z @tobiu added the `build` label
- 2026-01-10T16:59:34Z @tobiu added parent issue #8398
- 2026-01-10T17:04:32Z @tobiu referenced in commit `baf4ffa` - "enhancement: Minify index generation and prune Release model (#8509)"
- 2026-01-10T17:05:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T17:06:02Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully completed the optimization task:
> 
> 1.  **Minified JSON Output:** Updated both `buildScripts/createTicketIndex.mjs` and `buildScripts/createReleaseIndex.mjs` to write JSON files without indentation (`spaces: 4` removed). This significantly reduces the file size for network transfer.
> 2.  **Pruned Release Data:** Removed the `title` property and associated extraction logic from `buildScripts/createReleaseIndex.mjs` as it was redundant for the side navigation.
> 3.  **Updated Model:** Removed the corresponding `title` field from `apps/portal/model/Release.mjs`.
> 4.  **Regenerated Data:** Ran the build scripts to produce the updated `tickets.json` and `releases.json`.
> 
> The changes have been committed and pushed to `origin dev`.

- 2026-01-10T17:06:23Z @tobiu closed this issue

