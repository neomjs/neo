---
id: 2132
title: 'form.Fieldset: disableItemsOnCollapse => honor dynamic item disabled changes while being collapsed'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2021-05-23T09:18:34Z'
updatedAt: '2024-09-16T02:37:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2132'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:37:03Z'
---
# form.Fieldset: disableItemsOnCollapse => honor dynamic item disabled changes while being collapsed

Low priority item, since this is an edge case. Add comments in case you need this to increase the priority.

In case we collapse a fieldset with disableItemsOnCollapse: true, we will store disabled item ids.
If you enable a fieldset item while the fieldset is collapsed and then expand the fieldset, the field will get (silently) disabled again.

To solve this, we need to observe the disabled state of fieldset items and adjust the internal fieldset itemsDisabledMap as needed.

## Timeline

- 2021-05-23T09:18:34Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-01T02:38:47Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:47Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:37:03Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:37:03Z @github-actions closed this issue

