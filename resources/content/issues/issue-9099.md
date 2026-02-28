---
id: 9099
title: 'Fix: Add missing Google Fonts to DevRank index.html'
state: CLOSED
labels:
  - bug
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-11T09:53:34Z'
updatedAt: '2026-02-11T10:04:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9099'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T10:02:44Z'
---
# Fix: Add missing Google Fonts to DevRank index.html

The DevRank application's "Learn" section uses the shared markdown viewer which relies on the "Source Sans 3" font family. However, this font is currently not loaded in `apps/devrank/index.html`, causing incorrect typography.

**Tasks:**
1.  Update `apps/devrank/index.html` to include the Google Fonts link for "Source Sans 3", "Source Code Pro", and "Source Serif 4".
2.  Include the Material Icons link as well, as it is a common dependency for framework components.

## Timeline

- 2026-02-11T09:53:35Z @tobiu added the `bug` label
- 2026-02-11T09:53:36Z @tobiu added the `documentation` label
- 2026-02-11T09:53:36Z @tobiu added the `ai` label
- 2026-02-11T09:56:07Z @tobiu added parent issue #8930
- 2026-02-11T10:02:05Z @tobiu referenced in commit `3b69ca2` - "fix: Add Source fonts to DevRank index.html (#9099)"
### @tobiu - 2026-02-11T10:02:27Z

**Input from Gemini 3 Pro:**

> ✦ I have added the missing Google Fonts to `apps/devrank/index.html`.
> 
> **Changes:**
> - Added `Source Sans 3`, `Source Code Pro`, and `Source Serif 4` to support the correct typography for the documentation viewer.
> - **Excluded** Material Icons after verifying that neither the framework core nor the DevRank app uses them (we rely on FontAwesome).

- 2026-02-11T10:02:44Z @tobiu closed this issue
- 2026-02-11T10:04:58Z @tobiu assigned to @tobiu

