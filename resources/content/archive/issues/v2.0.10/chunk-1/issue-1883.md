---
id: 1883
title: 'layout.Card: support lazy loading items'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-28T12:13:44Z'
updatedAt: '2021-04-28T12:52:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1883'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-28T12:52:19Z'
---
# layout.Card: support lazy loading items

module can optionally be a function.

example:
```
            items: [{
                module         : () => import('./TableContainer.mjs'),
                reference      : 'table-container',
                tabButtonConfig: {
                    iconCls: 'fa fa-table',
                    route  : 'mainview=table',
                    text   : 'Table'
                }
            }, {
                module         : () => import('./mapboxGl/Container.mjs'),
                tabButtonConfig: {
                    iconCls: 'fa fa-globe-americas',
                    route  : 'mainview=mapboxglmap',
                    text   : 'Mapbox GL Map'
                }
            }]
```

epic.

## Timeline

- 2021-04-28T12:13:44Z @tobiu added the `enhancement` label
- 2021-04-28T12:13:45Z @tobiu assigned to @tobiu
- 2021-04-28T12:14:04Z @tobiu referenced in commit `fbab213` - "layout.Card: support lazy loading items #1883"
- 2021-04-28T12:15:49Z @tobiu referenced in commit `6aa2517` - "#1883 cleanup"
- 2021-04-28T12:26:02Z @tobiu referenced in commit `2fe283f` - "#1883 tab.Container: afterSetActiveIndex() => ensure the layout afterSetActiveIndex() does get called when lazy loading the initial module"
- 2021-04-28T12:34:51Z @tobiu referenced in commit `74dd663` - "#1883 tab.Container: afterSetActiveIndex() => switched the method to async to wait for the card layout change (async) and then fire the change event"
- 2021-04-28T12:43:29Z @tobiu referenced in commit `2606957` - "#1883 layout.Card: afterSetActiveIndex() => run the loop twice to reduce vdom updates"
- 2021-04-28T12:51:33Z @tobiu referenced in commit `8a21e06` - "#1883 layout.Card: afterSetActiveIndex() => remove the entries var"
### @tobiu - 2021-04-28T12:52:19Z

done.

- 2021-04-28T12:52:19Z @tobiu closed this issue

