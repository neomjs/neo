---
id: 6929
title: 'Feature Request: Add reactive `count_` config to `Neo.collection.Base`'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-01T18:08:22Z'
updatedAt: '2025-10-22T22:56:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6929'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-01T18:56:10Z'
---
# Feature Request: Add reactive `count_` config to `Neo.collection.Base`

**Reported by:** @tobiu on 2025-07-01

**Is your feature request related to a problem? Please describe.**
The current `getCount()` method on `Neo.collection.Base` is not reactive. This means that components or other parts of the application cannot directly observe changes in the collection's size using Neo.mjs's reactive binding system. This limits the ability to easily update UI elements that depend on the number of items in a collection without manual event handling.

**Describe the solution you'd like**
Add a reactive `count_` config to `Neo.collection.Base`. This config should automatically update whenever items are added to or removed from the collection (e.g., via `add`, `remove`, `splice` methods). The `afterSetCount` hook should be triggered when the count changes.

**Describe alternatives you've considered**
Currently, developers need to listen to the `mutate` event on the collection and manually update any dependent properties or UI elements. This adds boilerplate and complexity.

**Additional context**
This enhancement would align `Neo.collection.Base` more closely with the reactive nature of other Neo.mjs components and improve integration with `Neo.state.Provider` for future enhancements (though direct binding via `stores.myStoreName.count` would still require a separate `Neo.state.Provider` enhancement).

