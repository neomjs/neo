---
id: 8301
title: '[Neural Link] Implement toJSON in util.KeyNavigation'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T19:37:44Z'
updatedAt: '2026-01-03T19:56:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8301'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T19:56:28Z'
---
# [Neural Link] Implement toJSON in util.KeyNavigation

Implement `toJSON` serialization for `Neo.util.KeyNavigation`.

**Scope:**
- **`component`**: Export lightweight reference: `{ id, className }`.
- **`keys`**: Export `me.serializeConfig(me.keys)`.
    - This will now automatically handle any Neo instance scopes (like ViewControllers or Components) thanks to the enhancement in #8302.

**Goal:**
Standardize serialization for Neural Link without circular dependencies.

## Timeline

- 2026-01-03T19:37:46Z @tobiu added the `enhancement` label
- 2026-01-03T19:37:46Z @tobiu added the `ai` label
- 2026-01-03T19:37:46Z @tobiu added the `architecture` label
- 2026-01-03T19:38:09Z @tobiu assigned to @tobiu
- 2026-01-03T19:46:50Z @tobiu added parent issue #8200
- 2026-01-03T19:55:06Z @tobiu referenced in commit `594b34d` - "feat(util): Implement toJSON in util.KeyNavigation (#8301)"
- 2026-01-03T19:56:28Z @tobiu closed this issue

