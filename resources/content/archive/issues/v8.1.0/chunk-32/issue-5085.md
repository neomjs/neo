---
id: 5085
title: 'buildScripts/createComponent: wrong root selectors for theme files'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - ThorstenRaab
createdAt: '2023-11-06T12:06:27Z'
updatedAt: '2024-09-12T02:29:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5085'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:10Z'
---
# buildScripts/createComponent: wrong root selectors for theme files

```
:root .learnneo-theme-dark { // .learn-neo-view-home-content-component
        // add css theme information here
        --learn-neo-view-home-content-component-background-color: darkgreen; //example
}
```

it needs to be `:root .neo-theme-dark`

## Timeline

- 2023-11-06T12:06:27Z @tobiu added the `bug` label
- 2023-11-06T12:06:28Z @tobiu assigned to @ThorstenRaab
### @github-actions - 2024-08-29T02:26:21Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:21Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:10Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:10Z @github-actions closed this issue

