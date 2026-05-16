---
id: 2201
title: 'core.Base: set() => add support for set calls while processConfig() is running'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-29T09:24:13Z'
updatedAt: '2021-05-29T09:31:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2201'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-29T09:31:08Z'
---
# core.Base: set() => add support for set calls while processConfig() is running

I just run into an edge case:

```
    set(values={}) {
        let me = this;

        // instead of using:
        // me[configSymbol] = values;
        // we keep the Object instance (defined via Object.defineProperties() => non enumerable)

        Object.keys(me[configSymbol]).forEach(key => {
            delete me[configSymbol][key];
        });

        Object.assign(me[configSymbol], values);

        me.processConfigs(true);
    }
```

The logic of `set()` is intended to re-use the configSymbol. However, in case we are calling `set()` before the initial processing is done (e.g. inside an `afterSetConfig()` method), the current logic does delete entries which still need to get processed.

Instead, we should check if there are entries left inside the symbol and if so, process them first.

`processConfig()` can get used with a `forceAssign` param. We need to ensure that the processing continues with the same value, so we need to store the current mode inside a class property. E.g. if a config without an underscore does get assigned inside an afterSet() method, we do not want to override the new value with the initial value.

This also affects calling `set()`inside an afterSet method which got triggered by calling `set()` itself. It feels best to finish the previous set call(s) first, before pushing more values into the chain.

## Timeline

- 2021-05-29T09:24:14Z @tobiu added the `enhancement` label
- 2021-05-29T09:24:14Z @tobiu assigned to @tobiu
- 2021-05-29T09:31:01Z @tobiu referenced in commit `caa4d91` - "core.Base: set() => add support for set calls while processConfig() is running #2201"
- 2021-05-29T09:31:08Z @tobiu closed this issue
- 2021-05-29T13:58:53Z @tobiu cross-referenced by #2207

