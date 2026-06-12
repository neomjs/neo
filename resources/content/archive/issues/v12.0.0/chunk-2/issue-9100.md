---
id: 9100
title: 'Perf: Remove unused Material Icons from Portal index.html'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-11T10:04:37Z'
updatedAt: '2026-02-11T10:21:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9100'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T10:21:31Z'
---
# Perf: Remove unused Material Icons from Portal index.html

After verifying that the `apps/portal` codebase and its associated SCSS files do not contain any references to "material-icons", we can safely remove the Google Fonts link for Material Icons from `apps/portal/index.html`.

**Goal:**
Remove the unused Material Icons dependency to improve page load performance.

**Verification:**
`grep` searches across `apps/portal` and `resources/scss` confirmed zero usage.

## Timeline

- 2026-02-11T10:04:38Z @tobiu added the `enhancement` label
- 2026-02-11T10:04:38Z @tobiu added the `ai` label
- 2026-02-11T10:04:38Z @tobiu added the `performance` label
- 2026-02-11T10:05:41Z @tobiu added parent issue #8930
### @tobiu - 2026-02-11T10:12:26Z

**Input from Gemini 3 Pro:**

> ✦ I incorrectly assumed Material Icons were unused because of a case-sensitive grep mismatch ("material-icons" vs "Material Icons"). The `TreeList.scss` component, shared by Portal and DevRank, explicitly sets `font-family: 'Material Icons'`.
> 
> **Revised Plan:**
> 1.  Refactor `resources/scss/src/app/content/TreeList.scss` to use FontAwesome instead of Material Icons.
>     -   Replace `\e5cc` (Chevron Right) with `\f054` (FontAwesome `fa-chevron-right`).
>     -   Replace `\e5cf` (Chevron Down) with `\f078` (FontAwesome `fa-chevron-down`).
>     -   Update `font-family` to `"Font Awesome 6 Free"`.
>     -   Ensure `font-weight: 900` is set (required for FA solid icons).
> 2.  Also fix `resources/scss/src/apps/legit/Viewport.scss` which has the same issue.
> 
> This will allow us to keep the removal of the Material Icons dependency from `index.html`.

- 2026-02-11T10:16:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-11T10:21:08Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved this issue as part of the broader work in #9101 ("Fix: Standardize Font Awesome version usage in SCSS").
> 
> **Resolution:**
> The Material Icons dependency was removed from `apps/portal/index.html` as planned. The visual assets (Chevron icons in the TreeList) that were relying on it have been migrated to FontAwesome 7 Free, eliminating the need for the Material Icons font file.
> 
> This ensures both the performance gain (fewer requests) and visual consistency.

- 2026-02-11T10:21:31Z @tobiu closed this issue

