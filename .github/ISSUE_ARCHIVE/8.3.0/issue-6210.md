---
id: 6210
title: 'component.Base: update(), promiseUpdate() => critical rendering path'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-12T23:05:01Z'
updatedAt: '2025-01-12T23:34:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6210'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-12T23:34:15Z'
---
# component.Base: update(), promiseUpdate() => critical rendering path

* very similar to the recent changes for `render()`
* an update can insert new components (not used component types) into the component tree
* these cmps can have CSS file requirements
* the update should get delayed, in case the related CSS files are not fully loaded
* callbacks must not get lost

## Comments

### @tobiu - 2025-01-12 23:30

* this logic can get added inside just 1 spot: `updateVdom()`
* the check should only happen in case all other update requirements have successfully passed.

https://github.com/user-attachments/assets/a7d9629a-2787-44c4-b03d-a5461d925853

## Activity Log

- 2025-01-12 @tobiu added the `enhancement` label
- 2025-01-12 @tobiu assigned to @tobiu
- 2025-01-12 @tobiu referenced in commit `24aac85` - "component.Base: update(), promiseUpdate() => critical rendering path #6210"
- 2025-01-12 @tobiu closed this issue

