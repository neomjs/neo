---
id: 3778
title: 'main.addon.HighlightJS: add a Neo.config for selecting the initial theme'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-01-04T16:57:19Z'
updatedAt: '2024-09-14T02:26:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3778'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:21Z'
---
# main.addon.HighlightJS: add a Neo.config for selecting the initial theme

*(No description provided)*

## Timeline

- 2023-01-04T16:57:19Z @tobiu added the `enhancement` label
### @Dinkh - 2023-01-04T18:09:00Z

I updated HighlightJS (#3779). Now you can use:

```
Neo.main.addon.HighlightJS.switchTheme('light');
Neo.main.addon.HighlightJS.switchTheme('dark');
Neo.main.addon.HighlightJS.switchTheme('./path/to/css/file.css');
```

Is that good enough?

### @tobiu - 2023-01-04T20:37:09Z

for dynamically switching themes yes. for the initial theme no :)

i will add the config as well.

### @github-actions - 2024-08-30T02:27:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:21Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:21Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:21Z @github-actions closed this issue

