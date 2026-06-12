---
id: 9308
title: Implement custom sorting for Top Repo column in DevIndex
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T14:03:54Z'
updatedAt: '2026-02-26T14:07:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9308'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T14:07:55Z'
---
# Implement custom sorting for Top Repo column in DevIndex

**Problem:**
The `topRepo` column in the DevIndex grid maps to an array `['repoName', count]`. Default sorting fails because it compares array references rather than the contribution count. 

**Proposed Solution:**
Leverage "Turbo Mode" soft hydration by adding a `topRepoCount` virtual field to `DevIndex.model.Contributor` and intercepting the sort property inside `DevIndex.view.home.GridContainer#onSortColumn` to sort by this count.

- `apps/devindex/model/Contributor.mjs`: Add `topRepoCount` virtual field using `(data.topRepo ?? data.tr)?.[1] || 0`.
- `apps/devindex/view/home/GridContainer.mjs`: Override `onSortColumn` to swap `topRepo` for `topRepoCount` in `sortOpts` before passing to the store, preserving the original property for `removeSortingCss` to keep visual state correct.

## Timeline

- 2026-02-26T14:03:56Z @tobiu added the `enhancement` label
- 2026-02-26T14:03:56Z @tobiu added the `ai` label
- 2026-02-26T14:07:09Z @tobiu referenced in commit `2e8e63d` - "feat(devindex): Implement custom sorting for Top Repo column (#9308)"
### @tobiu - 2026-02-26T14:07:34Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the custom sorting for the Top Repo column using the "Turbo-Safe" virtual field approach (`topRepoCount`). The `onSortColumn` handler in `GridContainer` correctly intercepts the property and preserves the visual sorting state of the header. The changes have been successfully committed and pushed to the `dev` branch.

- 2026-02-26T14:07:39Z @tobiu assigned to @tobiu
- 2026-02-26T14:07:55Z @tobiu closed this issue

