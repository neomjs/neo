---
id: 2368
title: 'model.Component: support for twoWay bindings'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-15T09:28:32Z'
updatedAt: '2021-06-15T09:29:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2368'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-15T09:29:28Z'
---
# model.Component: support for twoWay bindings

A one way binding looks like this:
```
bind: {
    startTime: value: data => data.startTime
}
```

It should be optionally possible to not only update component configs when view model data props change, but also support the other direction. Change a component configs => update the bound model data property.

```
bind: {
    startTime: {twoWay: true, value: data => data.startTime}
}
```

To do this, model.Component needs to check if a config object was passed. If so, use `value.value`.

Neo.mjs: set() needs an update, to also call `this.afterSetConfig()` in case the fn does exist.

This method needs to get implemented on `component.Base` (lowest VM entry point).

```
afterSetConfig(key, value, oldValue) {
    if (Neo.currentWorker.isUsingViewModels) {
        let me   = this,
            bind = me.bind;

        if (bind && bind[key] && bind[key].twoWay) {
            me.getModel().setData(key, value);
        }
    }
}
```

## Timeline

- 2021-06-15T09:28:32Z @tobiu added the `enhancement` label
- 2021-06-15T09:28:32Z @tobiu assigned to @tobiu
- 2021-06-15T09:29:12Z @tobiu referenced in commit `7c4c7ff` - "model.Component: support for twoWay bindings #2368"
- 2021-06-15T09:29:29Z @tobiu closed this issue

