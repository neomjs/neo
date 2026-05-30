---
id: 5237
title: 'list.Base: neo-theme-neo-light needs an item background-color'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - mxmrtns
createdAt: '2024-02-18T19:21:56Z'
updatedAt: '2024-09-12T02:28:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5237'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:23Z'
---
# list.Base: neo-theme-neo-light needs an item background-color

``` --list-item-background-color: var(--cmp-list-item-surface-default);```

this comes from:
```--cmp-list-item-surface-default: transparent```

i think i already fixed it inside the repo, but the change to `#fff` needs to get into the figma template to keep it fixed :)

rationale: scrolling with sticky headers
<img width="368" alt="Screenshot 2024-02-18 at 20 21 27" src="https://github.com/neomjs/neo/assets/1177434/8f6a7ed5-5cfd-496c-b17d-ac936d0caef3">


## Timeline

- 2024-02-18T19:21:56Z @tobiu added the `bug` label
- 2024-02-18T19:21:57Z @tobiu assigned to @mxmrtns
- 2024-02-18T19:23:09Z @tobiu referenced in commit `69d26ba` - "list.Base: neo-theme-neo-light needs an item background-color #5237"
### @tobiu - 2024-02-18T19:23:52Z

pushed the change into the output.

@mxmrtns: please add a comment when the change is also inside the figma template and we can close this ticket. thx!

- 2024-03-26T16:29:32Z @tobiu referenced in commit `8eaf0cf` - "list.Base: neo-theme-neo-light needs an item background-color #5237"
### @github-actions - 2024-08-29T02:25:42Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:43Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:22Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:23Z @github-actions closed this issue

