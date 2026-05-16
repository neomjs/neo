---
id: 5086
title: buildScripts/moveFileOrFolder
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-11-07T14:25:33Z'
updatedAt: '2024-09-12T02:29:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5086'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:09Z'
---
# buildScripts/moveFileOrFolder

refactoring is kind of painful when using WebStorm or VSCode.

how it should work:
1. adjust the import paths (and keep them relative)
2. update the className (3 spots), matching to the new file / folder path
3. in case component based files get moved, also move their related scss files (src & themes)
4. honor the framework & workspace namespaces as targets
5. update all files which are using moved files (imports)

## Timeline

- 2023-11-07T14:25:33Z @tobiu added the `enhancement` label
- 2023-11-07T14:25:33Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-29T02:26:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:20Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:09Z @github-actions closed this issue

