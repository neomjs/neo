---
id: 1906
title: 'create-app program: apps.json => order the apps chronologically'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-30T11:21:40Z'
updatedAt: '2021-04-30T11:34:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1906'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-30T11:34:26Z'
---
# create-app program: apps.json => order the apps chronologically

a bit tricky, since we are using nested objects:
```
"apps": {
    "Covid": {
        "input": "./apps/covid/app.mjs",
        "mainThreadAddons": "'AmCharts', 'DragDrop', 'MapboxGL', 'Stylesheet'",
        "output": "/apps/covid/",
        "themes": "'neo-theme-dark', 'neo-theme-light'",
        "title": "COVID-19 IN NUMBERS"
    },
    "RealWorld": {
        "indexPath": "apps/realworld/index.ejs",
        "input": "./apps/realworld/app.mjs",
        "mainThreadAddons": "'LocalStorage', 'Markdown'",
        "output": "/apps/realworld/",
        "themes": "",
        "title": "Conduit"
    }
}
```

definitely nicer to not append new apps to the end.

## Timeline

- 2021-04-30T11:21:40Z @tobiu added the `enhancement` label
- 2021-04-30T11:21:40Z @tobiu assigned to @tobiu
- 2021-04-30T11:22:44Z @tobiu referenced in commit `fe1e7a7` - "create-app program: apps.json => order the apps chronologically #1906"
- 2021-04-30T11:34:26Z @tobiu closed this issue

