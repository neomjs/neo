---
id: 1813
title: 'model.Component: dynamically adding data props to a model that got defined without data'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-19T06:45:18Z'
updatedAt: '2021-04-19T06:54:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1813'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-19T06:54:56Z'
---
# model.Component: dynamically adding data props to a model that got defined without data

an edge case for sure.

we should use the `constructor` to assign an empty object to `this.data`.

E.g.:

```Javascript
    addDataProperty(key, value) {
        let me = this,
            data, scope;

        Neo.ns(key, true, me.data);

        data  = me.getDataScope(key);
        scope = data.scope;

        scope[data.key] = value;

        me.createDataProperties(me.data, 'data');
    }
```

The Neo.ns() call would not work in case data is undefined.

## Timeline

- 2021-04-19T06:45:18Z @tobiu added the `enhancement` label
- 2021-04-19T06:45:19Z @tobiu assigned to @tobiu
- 2021-04-19T06:45:41Z @tobiu referenced in commit `b1fcd52` - "model.Component: dynamically adding data props to a model that got defined without data #1813"
- 2021-04-19T06:53:03Z @tobiu referenced in commit `dfe3af2` - "#1813 getData() => removed the || {}, removed the ctor setter"
### @tobiu - 2021-04-19T06:54:56Z

never mind, we already have a `beforeGetData()` method in place.
Adjusted `getDataScope()` to remove the default object.



- 2021-04-19T06:54:56Z @tobiu closed this issue

