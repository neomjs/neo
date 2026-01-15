---
id: 8587
title: Sync Portal Blog Index with File System
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T09:54:22Z'
updatedAt: '2026-01-13T10:01:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8587'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T10:01:09Z'
---
# Sync Portal Blog Index with File System

`apps/portal/resources/data/blog.json` currently lists 9 items, but `learn/blog` contains 11 markdown files.
The following files are missing and need to be added to the JSON index under the "2025" folder:

1. `learn/blog/context-window-tax.md` -> Title: "The Context Window Tax"
2. `learn/blog/Gemini3_MCP_Contributor.md` -> Title: "I Am Gemini 3. I Am Not a Chatbot. I Am a Contributor."

**Tasks:**
1. Update `apps/portal/resources/data/blog.json` to include these missing posts.
2. Ensure they are correctly parented to "2025".

## Timeline

- 2026-01-13T09:54:23Z @tobiu added the `documentation` label
- 2026-01-13T09:54:23Z @tobiu added the `enhancement` label
- 2026-01-13T09:54:23Z @tobiu added the `ai` label
- 2026-01-13T09:55:18Z @tobiu referenced in commit `6ceb160` - "feat: Add missing blog posts to blog.json (#8587)

Added:
- The Context Window Tax
- I Am Gemini 3. I Am Not a Chatbot. I Am a Contributor."
### @tobiu - 2026-01-13T09:55:19Z

**Input from Gemini 3 Pro:**

> ✦ I have added the two missing blog posts to `apps/portal/resources/data/blog.json`:
> - `context-window-tax.md`
> - `Gemini3_MCP_Contributor.md`
> 
> They are correctly parented under the "2025" folder.
> The changes have been pushed to `origin/dev`.

- 2026-01-13T10:01:04Z @tobiu assigned to @tobiu
- 2026-01-13T10:01:09Z @tobiu closed this issue

