---
id: 6987
title: v10 harden core.Base#afterSetId()
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-08T15:54:35Z'
updatedAt: '2025-07-08T15:55:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6987'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-08T15:55:31Z'
---
# v10 harden core.Base#afterSetId()

* It should use `value` instead of `this.id` to avoid using using the config atom getter
* `oldValue` should check for the existence of `Neo.idMap`

While `oldValue` attempts => having a value without an idMap is a theoretical problem => could only happen in case `Neo.setupClass()` had bugs, the check is still reasonable.

## Timeline

- 2025-07-08T15:54:35Z @tobiu assigned to @tobiu
- 2025-07-08T15:54:36Z @tobiu added the `enhancement` label
- 2025-07-08T15:55:04Z @tobiu referenced in commit `951f581` - "v10 harden core.Base#afterSetId() #6987"
- 2025-07-08T15:55:31Z @tobiu closed this issue
- 2025-07-09T00:10:52Z @tobiu referenced in commit `16f3c3a` - "v10 harden core.Base#afterSetId() #6987"

