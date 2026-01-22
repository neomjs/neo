---
id: 8701
title: Improve Portal TreeList visual hierarchy
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T11:37:29Z'
updatedAt: '2026-01-16T11:43:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8701'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T11:43:59Z'
---
# Improve Portal TreeList visual hierarchy

Refine the visual hierarchy of the Portal tree list to address the current "inverted" weight issue where nested folders (Bold/700) appear heavier than top-level items (Medium/500).

**Proposed Changes:**
1.  **Top-Level Items:** Increase font-weight to `600` (SemiBold) to establish them as primary headers.
2.  **Nested Folders:** Decrease font-weight to `500` (Medium) to sit between headers and regular leaf items (400).
3.  **Result:** A clear visual hierarchy of 600 > 500 > 400.

File: `resources/scss/src/apps/portal/shared/content/TreeList.scss`

## Timeline

- 2026-01-16T11:37:31Z @tobiu added the `enhancement` label
- 2026-01-16T11:37:31Z @tobiu added the `design` label
- 2026-01-16T11:37:31Z @tobiu added the `ai` label
- 2026-01-16T11:43:15Z @tobiu referenced in commit `49f163b` - "style(portal): Enhance TreeList visual hierarchy with refined font sizes and weights (#8701)"
- 2026-01-16T11:43:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T11:43:32Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced the visual hierarchy of the Portal TreeList in commit 49f163b6b:
> 
> *   **Top-level items:** 18px / 600 (SemiBold)
> *   **Nested items (Folders):** 16px / 500 (Medium)
> *   **Leaf items:** 16px / 400 (Regular, inherited)
> 
> This establishes a clear "Section Header" (18px) vs. "Content" (16px) distinction.

- 2026-01-16T11:43:59Z @tobiu closed this issue

