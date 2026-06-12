---
id: 1546
title: 'util.Array: removeAdd() convenience method'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-17T23:39:39Z'
updatedAt: '2021-03-17T23:41:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1546'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-17T23:41:18Z'
---
# util.Array: removeAdd() convenience method

I am using `remove()` and `add()` in combination a lot, so a convenience method to combine the calls makes sense.

e.g.:
```
cls = dialog.cls;

NeoArray.remove(cls, me.currentTheme);
NeoArray.add(cls, theme);

dialog.cls = cls;
```

to keep it simple:
```
static removeAdd(arr, removeItems, addItems) {
    this.remove(arr, removeItems);
    this.add(arr, addItems);
}
```

I am not calling the method `replace()`, since this would indicate that items get replaced at its index and probably new items would only get added in case the item to replace exists.

feel free to open a new ticket in case you need a "real" `replace()` method.

## Timeline

- 2021-03-17T23:39:39Z @tobiu added the `enhancement` label
- 2021-03-17T23:39:39Z @tobiu assigned to @tobiu
- 2021-03-17T23:41:13Z @tobiu referenced in commit `77e79a4` - "util.Array: removeAdd() convenience method #1546"
- 2021-03-17T23:41:18Z @tobiu closed this issue

