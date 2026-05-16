---
id: 8520
title: Enhance Markdown Frontmatter Animation
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T19:59:48Z'
updatedAt: '2026-01-10T20:02:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8520'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T20:02:08Z'
---
# Enhance Markdown Frontmatter Animation

Implement smooth CSS transitions for the Markdown frontmatter `<details>` element using the modern `::details-content` pseudo-element. This allows for a "fancy" sliding animation (height and opacity) without JavaScript overhead.

**Changes:**
- Update `resources/scss/src/component/Markdown.scss` to include `::details-content` transitions.
- Refine existing margin transitions.


## Timeline

- 2026-01-10T19:59:49Z @tobiu added the `enhancement` label
- 2026-01-10T19:59:49Z @tobiu added the `design` label
- 2026-01-10T19:59:49Z @tobiu added the `ai` label
- 2026-01-10T20:00:12Z @tobiu added parent issue #8398
- 2026-01-10T20:00:15Z @tobiu assigned to @tobiu
- 2026-01-10T20:01:35Z @tobiu referenced in commit `ecbe5f2` - "feat: Enhance Markdown frontmatter animation using ::details-content (#8520)"
### @tobiu - 2026-01-10T20:01:50Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the CSS transitions using `::details-content` and `interpolate-size`. This should provide a smooth sliding animation for the frontmatter section on supported browsers (Chrome 125+).
> Changes pushed to `dev`.

- 2026-01-10T20:02:09Z @tobiu closed this issue

