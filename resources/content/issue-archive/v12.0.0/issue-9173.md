---
id: 9173
title: Enhance IconLink with Label Support and Update Sponsors Logic
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T17:55:51Z'
updatedAt: '2026-02-15T18:21:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9173'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T18:21:04Z'
---
# Enhance IconLink with Label Support and Update Sponsors Logic

We need to display a text label alongside the icon in `IconLink` components, specifically for the Sponsors column (Heart + Count) and Top Repo column. Instead of creating a new component, we will enhance `Neo.component.IconLink`.

**Tasks:**
1.  **Enhance `Neo.component.IconLink`:**
    -   Add `label_` config (reactive) to `IconLink.mjs`. "Label" is short, meaningful, and consistent with other components (e.g., Button).
    -   Update `_vdom` to include a `span` for the text.
    -   Implement `afterSetLabel` to toggle visibility/content of the text span.
    -   Ensure SCSS supports the layout (flexbox/spacing).

2.  **Update `Updater.mjs`:**
    -   Fetch `sponsorshipsAsMaintainer { totalCount }`.
    -   Store count in `s`.

3.  **Update `GridContainer.mjs`:**
    -   Implement Sponsors column using the enhanced `IconLink` with `label`.
    -   Update Top Repo to use `IconLink` with `label`.

## Timeline

- 2026-02-15T17:55:52Z @tobiu added the `enhancement` label
- 2026-02-15T17:55:53Z @tobiu added the `ai` label
- 2026-02-15T17:56:18Z @tobiu assigned to @tobiu
- 2026-02-15T17:56:25Z @tobiu added parent issue #9106
- 2026-02-15T17:59:38Z @tobiu referenced in commit `303bc5c` - "feat(component): Enhance IconLink with label support (#9173)

- Add label_ config (reactive).
- Update _vdom to include a span for the label.
- Implement afterSetLabel to toggle visibility and update text."
- 2026-02-15T18:00:06Z @tobiu referenced in commit `7cc9e8a` - "style(component): Add spacing for IconLink label (#9173)"
- 2026-02-15T18:20:41Z @tobiu referenced in commit `ef9ca04` - "feat(devindex): Enhance Sponsors and Top Repo visualization (#9173)

- IconLink.mjs: Add support for labelField, labelFormatter, and urlFormatter.
- Contributor.mjs: Change hasSponsors to Integer with defaultValue: null.
- Updater.mjs: Fetch sponsor count and store in 's' (hasSponsors).
- GridContainer.mjs: Use enhanced IconLink for Sponsors and Top Repo columns."
- 2026-02-15T18:21:04Z @tobiu closed this issue

