---
id: 6884
title: 'component.Base: text_'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-27T15:13:11Z'
updatedAt: '2025-06-27T15:16:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6884'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-27T15:16:31Z'
---
# component.Base: text_

* Alternative for `html_`, using `textContent`.
* Subclasses need to use `text` instead of `text_`, or remove the config in case it has a null value.
* `afterSetText()` can of course get overridden.

## Timeline

- 2025-06-27T15:13:12Z @tobiu added the `enhancement` label
- 2025-06-27T15:13:33Z @tobiu referenced in commit `056a420` - "component.Base: text_ #6884"
- 2025-06-27T15:16:31Z @tobiu closed this issue

