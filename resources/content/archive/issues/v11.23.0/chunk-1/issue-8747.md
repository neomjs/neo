---
id: 8747
title: Fix TreeList specificity preventing hover state
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T04:59:28Z'
updatedAt: '2026-01-17T05:10:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8747'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T05:10:59Z'
---
# Fix TreeList specificity preventing hover state

The specific rule `.neo-list-item:not(.neo-list-item[aria-selected=true])` in `TreeList.scss` sets `background-color: transparent`, which overrides the default hover state due to higher specificity.

We need to add a dedicated hover rule to restore visual feedback.

## Timeline

- 2026-01-17T04:59:30Z @tobiu added the `bug` label
- 2026-01-17T04:59:30Z @tobiu added the `design` label
- 2026-01-17T04:59:30Z @tobiu added the `ai` label
- 2026-01-17T04:59:40Z @tobiu added parent issue #8727
- 2026-01-17T04:59:43Z @tobiu assigned to @tobiu
- 2026-01-17T05:10:38Z @tobiu referenced in commit `dfe80e5` - "fix: Resolve TreeList hover/selected state specificity (#8747)"
### @tobiu - 2026-01-17T05:10:44Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the issue by:
> 
> 1.  Adding a nested `:hover` rule to the unselected item block to explicitly restore the hover background (fixing the `transparent` override).
> 2.  Adding a specific `&[aria-selected=true]:hover` rule to explicitly enforce the **selected** color scheme on hover, ensuring that selected items do not visually "deselect" to the gray hover color.
> 
> This ensures both states behave correctly and unambiguously.

- 2026-01-17T05:10:59Z @tobiu closed this issue

