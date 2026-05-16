---
id: 3172
title: Formulas in ViewModel and ViewController
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-06-20T09:43:32Z'
updatedAt: '2024-09-15T02:35:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3172'
author: Dinkh
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:35:46Z'
---
# Formulas in ViewModel and ViewController

I would like to get an easy way of listening to changes in viewModel Data and Store-configs
These should be listened to in formulas in the viewModel and viewController

@example
##viewModel
```
data: {
    a: 1
},
stores: {
    mystore: {
        isLoading: false  // config of the current state of the store
    }
}
formulas: {
    b: {
        bind: {a: 'a'},
        get(data => toUppercase(data.a);)
    },
    storeIsLoading: {
        bind: {isLoading: 'mystore.isLoading',
        get(data) {return isLoading}
    }
}
```

##viewController
```
formulas: {
    b: {
        bind: {a: 'a'},
        fn: 'onAChange'
    },
    storeIsLoading: {
        bind: {isLoading: 'mystore.isLoading',
        fn: 'onStoreLoadingChange'
    }
},

onAChange(value, oldValue) {},
onStoreLoadingChange(value, oldValue) {}
```

## Timeline

- 2022-06-20T09:43:32Z @Dinkh added the `enhancement` label
### @github-actions - 2024-08-31T02:25:47Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:25:48Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:35:46Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:35:46Z @github-actions closed this issue

