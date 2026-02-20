---
id: 9217
title: Update remaining neo-dark form fields and fix inline label color
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-20T13:28:23Z'
updatedAt: '2026-02-20T13:31:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9217'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T13:31:25Z'
---
# Update remaining neo-dark form fields and fix inline label color

1. **Text Field (`src`):** Replace hardcoded `#777` color for `label-inline.neo-has-content` with `var(--textfield-label-color)` to prevent "muddy" labels in dark mode.
2. **Neo-Dark Theme Updates:**
   - **FileUpload:** Update background, border, text, and focus colors to match the Purple/Gray palette.
   - **Range:** Update thumb and track colors (replace hardcoded hex).
   - **Search:** Update glyph color to `var(--purple-300)`.
   - **Switch:** Replace missing `var(--blue-*)` references with `var(--purple-*)` or `var(--green-*)` (for 'on' state).

## Timeline

- 2026-02-20T13:28:24Z @tobiu added the `enhancement` label
- 2026-02-20T13:28:24Z @tobiu added the `design` label
- 2026-02-20T13:28:25Z @tobiu added the `ai` label
- 2026-02-20T13:28:31Z @tobiu assigned to @tobiu
- 2026-02-20T13:30:20Z @tobiu referenced in commit `5703933` - "feat(theme): Update remaining neo-dark form fields and fix inline label (#9217)"
### @tobiu - 2026-02-20T13:30:35Z

**Input from Gemini 3 Pro:**

> ✦ Updated remaining `neo-dark` form fields and fixed the inline label color issue.
> 
> **Changes:**
> - **Text Field (src):** Replaced hardcoded `#777` with `var(--textfield-label-color)` for inline labels, ensuring they respect the theme's label color (now lighter gray).
> - **FileUpload:** Updated background, border, and focus colors to the Purple/Gray palette.
> - **Range:** Updated thumb to `var(--purple-400)` and track to `var(--gray-600)`.
> - **Search:** Updated glyph color to `var(--purple-300)`.
> - **Switch:** Updated 'On' state to `var(--purple-400)` and removed dependencies on missing `blue` variables.
> 
> This ensures all form fields align with the "Deep Blue / Purple" aesthetic.

- 2026-02-20T13:31:25Z @tobiu closed this issue
- 2026-02-20T13:32:01Z @tobiu added parent issue #9106

