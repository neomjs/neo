---
id: 8297
title: '[Neural Link] Implement toJSON in component.Base (add keys)'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:51:37Z'
updatedAt: '2026-01-03T20:01:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8297'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T20:01:31Z'
---
# [Neural Link] Implement toJSON in component.Base (add keys)

Update `Neo.component.Base.toJSON` to include the `keys` configuration.

**Implementation:**
- `keys`: Return `me.keys?.toJSON()`.

**Goal:**
Standardize serialization for Neural Link.


## Activity Log

- 2026-01-03 @tobiu added the `enhancement` label
- 2026-01-03 @tobiu added the `ai` label
- 2026-01-03 @tobiu added the `architecture` label
- 2026-01-03 @tobiu added parent issue #8200
- 2026-01-03 @tobiu assigned to @tobiu
- 2026-01-03 @tobiu referenced in commit `9433cd9` - "feat(component): Export keys in component.Base.toJSON (#8297)"
- 2026-01-03 @tobiu closed this issue

