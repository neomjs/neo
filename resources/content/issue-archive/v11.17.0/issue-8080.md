---
id: 8080
title: 'LivePreview: Reuse Markdown component reference to avoid re-creation'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-10T14:07:57Z'
updatedAt: '2025-12-10T14:30:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8080'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-10T14:30:12Z'
---
# LivePreview: Reuse Markdown component reference to avoid re-creation

In `src/code/LivePreview.mjs`, update `doRunSource` to reuse the existing `Neo.component.Markdown` instance if it exists and is valid.

Logic:
- Store the reference returned by `container.add()` in `me.markdownComponent`.
- In `doRunSource`, if `me.markdownComponent` exists and is not destroyed, update its `value`.
- Otherwise, proceed with `container.removeAll()` and `container.add()`, storing the new reference.

This prevents the component from being destroyed/recreated on every keystroke, avoiding unnecessary parent VDOM updates and race conditions.

## Timeline

- 2025-12-10 @tobiu added the `enhancement` label
- 2025-12-10 @tobiu added the `ai` label
- 2025-12-10 @tobiu assigned to @tobiu
- 2025-12-10 @tobiu referenced in commit `768af2a` - "LivePreview: Reuse Markdown component reference to avoid re-creation #8080"
- 2025-12-10 @tobiu closed this issue

