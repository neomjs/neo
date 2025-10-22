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
closedAt: '2025-07-08T15:55:31Z'
---
# v10 harden core.Base#afterSetId()

**Reported by:** @tobiu on 2025-07-08

* It should use `value` instead of `this.id` to avoid using using the config atom getter
* `oldValue` should check for the existence of `Neo.idMap`

While `oldValue` attempts => having a value without an idMap is a theoretical problem => could only happen in case `Neo.setupClass()` had bugs, the check is still reasonable.

