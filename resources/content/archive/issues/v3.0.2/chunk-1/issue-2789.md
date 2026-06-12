---
id: 2789
title: 'core.Observable:fire() => add a check for string based event handlers'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-01-02T14:44:14Z'
updatedAt: '2022-01-02T14:56:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2789'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-02T14:56:36Z'
---
# core.Observable:fire() => add a check for string based event handlers

by default, view controllers will map those into their scope, if available.

however, in case we want to override event handlers (e.g. when defining a plugin), it can be handy to go for string based events which will get scoped to their fn once the first event fires.

example (list.Base):
```
afterSetStore(value, oldValue) {
    let me = this;

    value?.on({
        filter      : me.onStoreFilter,
        load        : me.onStoreLoad,
        recordChange: me.onStoreRecordChange,
        scope       : me
    });

    value?.getCount() > 0 && me.onStoreLoad();
}
```

could become:
```
afterSetStore(value, oldValue) {
    let me = this;

    value?.on({
        filter      : 'onStoreFilter',
        load        : 'onStoreLoad',
        recordChange: 'onStoreRecordChange',
        scope       : me
    });

    value?.getCount() > 0 && me.onStoreLoad();
}
```

in which case `list.plugin.Animate` can override the store event-handlers.

## Timeline

- 2022-01-02T14:44:14Z @tobiu added the `enhancement` label
- 2022-01-02T14:44:14Z @tobiu assigned to @tobiu
- 2022-01-02T14:45:23Z @tobiu referenced in commit `1b01847` - "core.Observable:fire() => add a check for string based event handlers #2789"
- 2022-01-02T14:48:32Z @tobiu referenced in commit `65211a2` - "#2789 adjusted list.Base and list.plugin.Animate to test string based event handlers"
- 2022-01-02T14:56:36Z @tobiu closed this issue

