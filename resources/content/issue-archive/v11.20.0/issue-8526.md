---
id: 8526
title: Fix CSS collision for state badge icons in Tickets view
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T21:48:06Z'
updatedAt: '2026-01-10T21:49:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8526'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T21:49:24Z'
---
# Fix CSS collision for state badge icons in Tickets view

**Goal:** Fix a CSS selector collision in the Tickets view where sub-issue icon colors were incorrectly affecting state badges within the frontmatter table.

**Context:**
The `.neo-frontmatter-table i.fa-circle-check` rule was intended for icons within sub-issue lists (Checkmarks). However, since the ticket's "state" badge (Open/Closed) also uses this icon and can appear within the frontmatter table, it was inheriting the green color, leading to poor contrast (green icon on purple background for closed tickets).

**Changes:**
1.  **`resources/scss/src/apps/portal/news/tickets/Component.scss`**: Scoped the `i.fa-circle-check` and `i.fa-circle` rules to `.neo-sub-issue` specifically.

**Outcome:**
Sub-issue checkmarks remain green/grey, while state badges preserve their correct white icon color, ensuring visual consistency and accessibility.

## Timeline

- 2026-01-10T21:48:07Z @tobiu added the `bug` label
- 2026-01-10T21:48:07Z @tobiu added the `design` label
- 2026-01-10T21:48:07Z @tobiu added the `ai` label
- 2026-01-10T21:48:30Z @tobiu added parent issue #8398
- 2026-01-10T21:48:42Z @tobiu referenced in commit `3fe7bed` - "fix: Scope sub-issue icon colors to avoid collision (#8526)

Prevents green color override on state badge icons within the frontmatter table by targeting .neo-sub-issue specifically."
- 2026-01-10T21:48:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T21:49:06Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the CSS collision. The icon colors for sub-issues are now scoped to the `.neo-sub-issue` class, ensuring they no longer bleed into the state badges within the frontmatter table.
> 
> Closing as completed.

- 2026-01-10T21:49:24Z @tobiu closed this issue

