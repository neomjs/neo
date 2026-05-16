---
id: 4892
title: 'component.Base: getDomRect() => regression bug for arrays'
state: CLOSED
labels:
  - bug
assignees:
  - ExtAnimal
createdAt: '2023-09-11T20:44:49Z'
updatedAt: '2023-10-02T09:34:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4892'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-02T09:34:51Z'
---
# component.Base: getDomRect() => regression bug for arrays

inside the old version, we were able to pass either an id, or an array of ids => getting an array of rects back.

```
    /**
     * Convenience shortcut
     * @param {String[]|String} id=this.id
     * @param {String} appName=this.appName
     * @returns {Promise<*>}
     */
    getDomRect(id=this.id, appName=this.appName) {
        return Neo.main.DomAccess.getBoundingClientRect({appName, id})
    }
```

the new version assumes that there will be just one rect, transforming it to a DOMRect => this breaks a lot of use cases. E.g.:
horizontal scrolling inside `component.DateSelector`:
https://github.com/neomjs/neo/blob/dev/src/component/DateSelector.mjs#L428


## Timeline

- 2023-09-11T20:44:49Z @tobiu added the `bug` label
- 2023-09-11T20:44:49Z @tobiu assigned to @ExtAnimal
- 2023-09-12T08:40:10Z @ExtAnimal cross-referenced by PR #4894
### @tobiu - 2023-10-02T09:34:51Z

fixed by: https://github.com/neomjs/neo/issues/4950

- 2023-10-02T09:34:51Z @tobiu closed this issue

