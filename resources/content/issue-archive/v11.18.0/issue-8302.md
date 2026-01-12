---
id: 8302
title: '[Neural Link] Enhance core.Base.serializeConfig to handle Neo Instances'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T19:46:36Z'
updatedAt: '2026-01-03T19:48:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8302'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T19:48:13Z'
---
# [Neural Link] Enhance core.Base.serializeConfig to handle Neo Instances

Current `serializeConfig` implementation handles classes (constructors) but does not detect Neo instances.
This creates circular dependency risks when serializing configs that contain instance references (e.g. `KeyNavigation` scopes).

**Task:**
Update `Neo.core.Base.prototype.serializeConfig` to check for Neo instances.

**Implementation:**
- Check if `value instanceof Neo.core.Base` (or uses `isInstance` symbol if accessible, or `value.isClass` check).
- If instance: return lightweight reference `{ className: value.className, id: value.id }`.
- Ensure it still handles Arrays and Objects recursively.

**Value:**
- Prevents circular dependencies in `toJSON` outputs.
- Standardizes instance references in serialized configs.

## Timeline

- 2026-01-03T19:46:37Z @tobiu added the `enhancement` label
- 2026-01-03T19:46:38Z @tobiu added the `ai` label
- 2026-01-03T19:46:38Z @tobiu added the `architecture` label
- 2026-01-03T19:46:57Z @tobiu assigned to @tobiu
- 2026-01-03T19:47:07Z @tobiu added parent issue #8200
- 2026-01-03T19:47:58Z @tobiu referenced in commit `04f0f0d` - "feat(core): Enhance serializeConfig to handle Neo instances (#8302)"
- 2026-01-03T19:48:14Z @tobiu closed this issue
- 2026-01-03T19:51:35Z @tobiu cross-referenced by #8301

