---
id: 3781
title: Themes should optionally only need colors
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-01-04T20:39:11Z'
updatedAt: '2024-09-14T02:26:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3781'
author: Dinkh
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:19Z'
---
# Themes should optionally only need colors

I would like to be able to only add a style.scss with colors being merged with light and dark.
To be able to use it, there should be a preset file.

Whatever item you leave blank, will be taken from the parent-theme.

style.scss
```
    'base-theme': 'theme-light',

    'button-active-background-color'  : #ddd,
    'button-active-border-color'    : #1c60a0,
    'button-active-color'             : #1c60a0,
    'button-background-color'         : #fff,
    'button-background-image'         : none,
    'button-background-gradient-end'  : #323536,
    'button-background-gradient-start': #434749,
    'button-badge-background-color'   : #1c60a0,
    'button-badge-color'              : #fff,
    'button-badge-margin-left'        : -10px,
    'button-badge-margin-top'         : -10px,
   ...
```

## Timeline

- 2023-01-04T20:39:11Z @Dinkh added the `enhancement` label
### @tobiu - 2023-01-04T20:55:21Z

a theme in general is just a "vars" folder. merging a theme with a base theme is tricky (not impossible though). we would need to enhance the build and watch themes engine.

the more important item is imho adding color palettes to themes and using most other variables by reference (e.g. adjusted with `darken()` or `lighten()`. might be a topic for @mxmrtns.

### @github-actions - 2024-08-30T02:27:18Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:18Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:18Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:19Z @github-actions closed this issue

