---
id: 246
title: autoGenerateGetSet() => set() => change check for non primitive params
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-02-25T11:39:55Z'
updatedAt: '2024-08-27T20:54:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/246'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-27T20:54:15Z'
---
# autoGenerateGetSet() => set() => change check for non primitive params

see #242 

```
// todo: we could compare objects & arrays for equality
if (Neo.isObject(value) || Array.isArray(value) || value !== oldValue) {
```

The current approach will trigger a change event for each object / array, not checking if the content did change.

The reason was mostly that this logic is inside the Neo.mjs file itself.

The logic for working with non primitive types is e.g. here:
> src/util/Array.mjs

> src/util/Object.mjs

Obviously, we can not import those files into the very core file of the framework, but we can create shortcuts into the Neo namespace and assume that these util (core) files are always included. @ExtAnimal: Thoughts?

What we need is something like `isDeeplyStrict()` inside Siesta => a method which can check structures containing nested objects / arrays for equality.

This one should be mapped into the Neo namespace => `Neo.isEqual()`

## Timeline

- 2020-02-25T11:39:55Z @tobiu added the `enhancement` label
### @tobiu - 2024-08-27T20:54:15Z

already resolved. `Neo.core.Compare: isEqual()`

- 2024-08-27T20:54:15Z @tobiu closed this issue

