---
id: 2555
title: 'vdom.Helper: createDeltas(), main.mixin.DeltaUpdates: remove all nodes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-01T14:00:27Z'
updatedAt: '2021-07-01T14:01:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2555'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-01T14:01:48Z'
---
# vdom.Helper: createDeltas(), main.mixin.DeltaUpdates: remove all nodes

This is an edge case, but an important one.

While playing with the table performance demo, I added 1k rows to a table body and removed them afterwards:
![Screenshot 2021-07-01 at 15 46 36](https://user-images.githubusercontent.com/1177434/124136237-dc360c80-da84-11eb-8cb6-02ed9ff54983.png)

This makes no sense, in case there are literally no new children.

I added a new DeltaUpdates method: `du_setTextContent()`, which we can trigger with the `setTextContent` delta action property.

`vdom.Helper: createDeltas()` has now a new check for childNodes: in case the new vnode has no children and the old vnode has 1+, trigger the new delta action.

Result:
![Screenshot 2021-07-01 at 15 47 27](https://user-images.githubusercontent.com/1177434/124136855-71390580-da85-11eb-88a6-5fb83fd1f577.png)


## Timeline

- 2021-07-01T14:00:27Z @tobiu added the `enhancement` label
- 2021-07-01T14:00:28Z @tobiu assigned to @tobiu
- 2021-07-01T14:01:40Z @tobiu referenced in commit `8b1bd98` - "vdom.Helper: createDeltas(), main.mixin.DeltaUpdates: remove all nodes #2555"
- 2021-07-01T14:01:48Z @tobiu closed this issue

