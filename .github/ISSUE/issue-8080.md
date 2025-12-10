---
id: 8080
title: 'LivePreview: Reuse Markdown component reference to avoid re-creation'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-10T14:07:57Z'
updatedAt: '2025-12-10T14:08:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8080'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# LivePreview: Reuse Markdown component reference to avoid re-creation

In `src/code/LivePreview.mjs`, update `doRunSource` to reuse the existing `Neo.component.Markdown` instance if it exists and is valid.

Logic:
- Store the reference returned by `container.add()` in `me.markdownComponent`.
- In `doRunSource`, if `me.markdownComponent` exists and is not destroyed, update its `value`.
- Otherwise, proceed with `container.removeAll()` and `container.add()`, storing the new reference.

This prevents the component from being destroyed/recreated on every keystroke, avoiding unnecessary parent VDOM updates and race conditions.

## Activity Log

- 2025-12-10 @tobiu added the `enhancement` label
- 2025-12-10 @tobiu added the `ai` label
- 2025-12-10 @tobiu assigned to @tobiu

