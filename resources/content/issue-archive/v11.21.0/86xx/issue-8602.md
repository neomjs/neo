---
id: 8602
title: Implement Neo.container.Fragment Class & VNode Support
state: CLOSED
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-01-13T14:38:50Z'
updatedAt: '2026-01-13T15:49:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8602'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T15:49:18Z'
---
# Implement Neo.container.Fragment Class & VNode Support

**Goal:** Create the `Neo.container.Fragment` class and enable `tag: 'fragment'` in the VNode system.

**Tasks:**
1.  **Create `src/container/Fragment.mjs`**:
    *   Extend `Neo.container.Base`.
    *   Set static config `tag: 'fragment'`.
    *   Set `layout: null` (Fragments cannot have layouts as they have no wrapper).
2.  **Update `src/vdom/VNode.mjs`**:
    *   Allow `nodeName` to be `'fragment'`.
    *   Ensure `VNode` constructor handles it correctly.

**Note:** `Neo.component.Base` already supports the `tag_` config, so we leverage that.

## Timeline

- 2026-01-13T14:38:51Z @tobiu added the `ai` label
- 2026-01-13T14:38:51Z @tobiu added the `core` label
- 2026-01-13T14:38:51Z @tobiu added the `feature` label
- 2026-01-13T14:40:05Z @tobiu added parent issue #8601
- 2026-01-13T15:17:35Z @tobiu cross-referenced by #8601
- 2026-01-13T15:18:18Z @tobiu assigned to @tobiu
- 2026-01-13T15:48:56Z @tobiu referenced in commit `92d5017` - "feat: Implement Neo.container.Fragment (#8602)"
### @tobiu - 2026-01-13T15:48:59Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the `Neo.container.Fragment` class.
> - Extends `Neo.container.Base`.
> - Sets `tag: 'fragment'`.
> - Sets `layout: null` and prevents layout creation.
> - Includes safeguard hooks to return `null` for `cls`, `style`, and wrapper variants, ensuring no DOM attributes are accidentally applied to the fragment itself.
> - Verified `src/vdom/VNode.mjs` supports `tag: 'fragment'` via the `nodeName` mapping.
> 
> Ready for next steps in the Epic.

- 2026-01-13T15:49:18Z @tobiu closed this issue

