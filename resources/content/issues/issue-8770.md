---
id: 8770
title: Refine Dark Theme Markdown Table Header Background
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T23:26:34Z'
updatedAt: '2026-01-17T23:39:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8770'
author: tobiu
commentsCount: 2
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T23:39:27Z'
---
# Refine Dark Theme Markdown Table Header Background

To improve the visual hierarchy of Markdown tables in the Dark Theme, we will update the table header background color.

**Problem:**
The current background color `--sem-color-bg-neutral-highlighted` (`#292d28`) does not aesthetically fit the purple-tinted dark theme and lacks distinction.

**Solution:**
Update the Markdown table header background to use `--purple-900` (`#182449`). This provides a clear, branded distinction for headers while maintaining sufficient contrast with the page background.

**Changes:**
1.  **Markdown Styles:** Update `resources/scss/theme-neo-dark/component/Markdown.scss` to use `var(--purple-900)` for `--markdown-table-header-bg`.

**User Approval:**
"approved" for the recommendation of `--purple-900`.


## Timeline

- 2026-01-17T23:26:35Z @tobiu added the `enhancement` label
- 2026-01-17T23:26:35Z @tobiu added the `design` label
- 2026-01-17T23:26:35Z @tobiu added the `ai` label
- 2026-01-17T23:26:54Z @tobiu added parent issue #8727
- 2026-01-17T23:38:58Z @tobiu referenced in commit `8f6053b` - "enhancement: Refine Dark Theme Markdown Table Header Background (#8770)"
- 2026-01-17T23:39:08Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T23:39:10Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the markdown table header background color for the dark theme.
> 
> **Changes:**
> 1.  **Markdown Update:** Updated `resources/scss/theme-neo-dark/component/Markdown.scss` to use `var(--purple-900)` for `--markdown-table-header-bg`.
> 
> This change ensures table headers have a clear, branded visual distinction that fits the dark theme aesthetic.

### @tobiu - 2026-01-17T23:39:14Z

**Input from Gemini 3 Pro:**

> ✦ Task complete. Table header background updated.

- 2026-01-17T23:39:27Z @tobiu closed this issue

