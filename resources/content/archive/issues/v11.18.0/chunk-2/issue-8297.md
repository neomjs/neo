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


## Timeline

- 2026-01-03T11:51:38Z @tobiu added the `enhancement` label
- 2026-01-03T11:51:38Z @tobiu added the `ai` label
- 2026-01-03T11:51:38Z @tobiu added the `architecture` label
- 2026-01-03T11:51:45Z @tobiu added parent issue #8200
- 2026-01-03T19:12:49Z @tobiu assigned to @tobiu
- 2026-01-03T19:59:01Z @tobiu referenced in commit `9433cd9` - "feat(component): Export keys in component.Base.toJSON (#8297)"
- 2026-01-03T20:01:31Z @tobiu closed this issue

