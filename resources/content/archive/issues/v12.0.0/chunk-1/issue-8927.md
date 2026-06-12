---
id: 8927
title: 'Cleanup: Remove unused set_component mapping in AI Client'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-31T16:46:43Z'
updatedAt: '2026-01-31T16:51:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8927'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T16:51:59Z'
---
# Cleanup: Remove unused set_component mapping in AI Client

We identified that `src/ai/Client.mjs` maps `set_component` to `ComponentService`, but `ComponentService` lacks this method. This functionality is fully covered by `InstanceService.setInstanceProperties`.

**Goal:**
Remove the mapping for `set_component` in `src/ai/Client.mjs` to clean up the API surface area.

**Reference:**
[src/ai/Client.mjs](src/ai/Client.mjs)
```javascript
me.serviceMap = {
    // ...
    set_component: component, // Remove this
    // ...
}
```

## Timeline

- 2026-01-31T16:46:44Z @tobiu added the `enhancement` label
- 2026-01-31T16:46:44Z @tobiu added the `ai` label
- 2026-01-31T16:46:57Z @tobiu assigned to @tobiu
- 2026-01-31T16:49:56Z @tobiu removed the `enhancement` label
- 2026-01-31T16:49:56Z @tobiu added the `refactoring` label
- 2026-01-31T16:49:56Z @tobiu changed title from **Feat: Implement call_method tool for Neural Link** to **Cleanup: Remove unused set_component mapping in AI Client**
- 2026-01-31T16:51:26Z @tobiu referenced in commit `fd73813` - "cleanup: Remove unused set_component mapping in AI Client (#8927)"
### @tobiu - 2026-01-31T16:51:44Z

**Input from Gemini 3 Pro:**

> ✦ I have removed the unused `set_component` mapping from `src/ai/Client.mjs`.
> 
> This cleanup reduces confusion as `set_component` was mapped to `ComponentService` but not implemented there, while `set_instance_properties` (mapped to `InstanceService`) covers the functionality.

- 2026-01-31T16:51:59Z @tobiu closed this issue

