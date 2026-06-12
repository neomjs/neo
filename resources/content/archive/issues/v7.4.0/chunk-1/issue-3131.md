---
id: 3131
title: 'component.Base: hidden_ config'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-06-07T10:35:54Z'
updatedAt: '2024-09-15T02:35:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3131'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:35:53Z'
---
# component.Base: hidden_ config

@Dinkh 

we should create a new config, which enables us to check the hidden state as well as changing it.

this will also allow us to do bulk-updates in a convenient way:
```
myComponent.set({
    disabled: true,
    hidden  : true
})
```

internally we will need an `afterSetHidden()` method to handle the updates. this one could call the `hide()` and `show()` methods, in case it provides extra value.

e.g. hide / show could get a param to override the `hideMode` config for specific calls.

## Timeline

- 2022-06-07T10:35:55Z @tobiu added the `enhancement` label
- 2022-06-07T10:44:55Z @tobiu cross-referenced by #3132
### @tobiu - 2022-06-07T10:46:03Z

if we are keeping the show / hide methods, they should silently update the hidden state as well.

`this._hidden = {Boolean};`

### @Dinkh - 2022-06-07T12:04:46Z

I would prefer to be able to hide/show on node and component level.

Neo.show('nodeId' | 'componentId') / Neo.hide('nodeId' | 'componentId')

In addition the components should get a _hidden and _disabled config

### @github-actions - 2024-08-31T02:25:53Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:25:53Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:35:53Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:35:53Z @github-actions closed this issue

