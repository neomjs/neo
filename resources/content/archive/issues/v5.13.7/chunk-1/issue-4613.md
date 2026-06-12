---
id: 4613
title: 'component.Base: detect running parent vdom updates & wait until they are done'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-01T08:50:44Z'
updatedAt: '2023-08-02T18:17:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4613'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-02T18:17:02Z'
---
# component.Base: detect running parent vdom updates & wait until they are done

business logic can have complex ui interactions, which can affect multiple components in parallel.

the catch with multithreading is that these updates are async (round-trip between the app worker, vdom worker and main). while these round trips are blazing fast (worker messages take 0.x - 3ms), there are still edge cases with collisions, which can corrupt the state.

i made the decision intentionally, that components shall not lock parents while updating, since this would be bad for the overall performance. think of a toolbar where you want to update multiple buttons in parallel. this must not happen in sequence.

however, what we can and should do: before starting an update cycle, a component should check the entire parent chain (via parentId(s)). if a parent update is happening, wait until it is done. meaning: the parent which is updating needs to get a flag (array with component ids). once an update is done, in case no further update is scheduled, the component needs to trigger all updates for the components inside the wait-list array and the game continues.

benefits: 

- at this point, bulk updates often get resolved by developers using `setTimeout()` calls. these delays are often too long (bad for the performance).
- we can add (optional) debugging logs to notify developers about colliding updates, so they can easily spot these occurrences and act accordingly.

while developers should be smart about how they structure bulk updates, this new feature should improve the overall developer experience.

## Timeline

- 2023-08-01T08:50:44Z @tobiu added the `enhancement` label
- 2023-08-01T08:50:44Z @tobiu assigned to @tobiu
- 2023-08-02T17:49:39Z @tobiu referenced in commit `e8694ef` - "#4613 component.Base: isParentVdomUpdating()"
- 2023-08-02T18:07:58Z @tobiu referenced in commit `cb0a582` - "#4613 component.Base: resolveVdomUpdate()"
- 2023-08-02T18:14:15Z @tobiu referenced in commit `e5aeb5e` - "#4613 Neo.config.logVdomUpdateCollisions"
- 2023-08-02T18:15:38Z @tobiu referenced in commit `c53f3f9` - "#4613 component.Base: isParentVdomUpdating() => added a missing return statement"
### @tobiu - 2023-08-02T18:17:02Z

intense one :)

- 2023-08-02T18:17:02Z @tobiu closed this issue

