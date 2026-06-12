---
id: 8462
title: 'Portal App: Update SectionsList styling to match new transparent design'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T11:58:13Z'
updatedAt: '2026-01-09T12:00:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8462'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T12:00:57Z'
---
# Portal App: Update SectionsList styling to match new transparent design

**Goal:** Update the styling of the `SectionsList` component in the Portal app to align with the new transparent design language introduced in recent updates.

**Changes Required:**
- Modify `resources/scss/src/apps/portal/shared/content/SectionsList.scss`.
- Ensure non-selected list items have a transparent background to blend in with the new portal background effect.
- Maintain the existing specific styling for selected items (which are already transparent but have specific color/weight).
- Standardize padding and spacing if necessary to match the `TreeList` aesthetic where appropriate.

**Reference:**
The user provided the following desired SCSS/CSS logic:
```scss
.neo-list .neo-list-item {
    background-color: transparent; // Was var(--list-item-background-color)
    // ...
}
```
And context about the new `.portal-shared-background`.

## Timeline

- 2026-01-09T11:58:14Z @tobiu added the `enhancement` label
- 2026-01-09T11:58:14Z @tobiu added the `ai` label
- 2026-01-09T11:58:59Z @tobiu referenced in commit `60916b8` - "style: Update SectionsList to use transparent background (#8462)"
- 2026-01-09T12:00:41Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T12:00:44Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `resources/scss/src/apps/portal/shared/content/SectionsList.scss` to set `background-color: transparent` on `.neo-list-item`. This ensures non-selected items blend in with the new portal background, matching the design of the left-side tree navigation.

- 2026-01-09T12:00:57Z @tobiu closed this issue

