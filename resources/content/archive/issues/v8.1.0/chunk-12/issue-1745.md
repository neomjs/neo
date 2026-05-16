---
id: 1745
title: 'model.Component: support binding stores to any config name'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-09T20:12:06Z'
updatedAt: '2021-04-09T21:32:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1745'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-09T21:32:19Z'
---
# model.Component: support binding stores to any config name

the first version is too limiting, since it only allows to map a view model store to a config called store.

it should be possible to add a store to any config name.

to make this happen, we need a unique identifier to see if a value is a store.

```
bind: {
    store: 'stores.myStore'
}
```

## Timeline

- 2021-04-09T20:12:06Z @tobiu added the `enhancement` label
- 2021-04-09T20:12:06Z @tobiu assigned to @tobiu
- 2021-04-09T20:23:05Z @tobiu referenced in commit `4f482e0` - "#1745 resolveStore() method => working version for bindings into the closest view model"
- 2021-04-09T21:00:54Z @tobiu referenced in commit `95c625e` - "#1745 support for binding to stores inside of parent view models"
### @tobiu - 2021-04-09T21:01:28Z

<img width="952" alt="Screenshot 2021-04-09 at 22 57 45" src="https://user-images.githubusercontent.com/1177434/114240223-78211200-9987-11eb-938d-8e7c2d940437.png">

<img width="434" alt="Screenshot 2021-04-09 at 22 57 22" src="https://user-images.githubusercontent.com/1177434/114240239-7e16f300-9987-11eb-8e7c-b2c8e6298d6e.png">

![Screenshot 2021-04-09 at 22 56 38](https://user-images.githubusercontent.com/1177434/114240245-8111e380-9987-11eb-8701-5ccc25d910d3.png)


### @tobiu - 2021-04-09T21:01:52Z

will remove the dummy testing model & log again

- 2021-04-09T21:02:33Z @tobiu referenced in commit `1fe2aba` - "#1745 removing the testing log & dummy examples model"
- 2021-04-09T21:30:31Z @tobiu referenced in commit `cccad54` - "#1745 adjusted the createBindings() logic to ignore store values inside the bind config"
### @tobiu - 2021-04-09T21:32:19Z

done.

- 2021-04-09T21:32:19Z @tobiu closed this issue

