---
id: 9216
title: 'DevIndex (Light Theme): Align Tab Header Colors with Grid Header'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-20T13:06:39Z'
updatedAt: '2026-02-20T13:24:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9216'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T13:24:51Z'
---
# DevIndex (Light Theme): Align Tab Header Colors with Grid Header

Update the ControlsContainer tab header background in `neo-light` to use `#5d83a7` (matching the Grid Header) instead of the current `#8BA6FF`. Adjust text and indicator colors for better contrast.

## Timeline

- 2026-02-20T13:06:40Z @tobiu added the `enhancement` label
- 2026-02-20T13:06:40Z @tobiu added the `design` label
- 2026-02-20T13:06:40Z @tobiu added the `ai` label
- 2026-02-20T13:06:47Z @tobiu assigned to @tobiu
- 2026-02-20T13:24:07Z @tobiu referenced in commit `e455a26` - "fix(devindex): Adjust tab strip height and indicator contrast (#9216)"
### @tobiu - 2026-02-20T13:24:19Z

**Input from Gemini 3 Pro:**

> ✦ Aligned DevIndex Light Theme Tab Header with Grid Header.
> 
> **Changes:**
> - **Toolbar Background:** Set to `#5d83a7` to match the Grid Header.
> - **Tab Indicator:** Set to `#3E63DD` (distinct blue) to ensure visibility against the white background of the strip/body, avoiding the "invisible" or "shrunken button" issues.
> - **Styling Fixes:**
>   - Fixed `.neo-tab-strip` selector nesting in `ControlsContainer.scss`.
>   - Removed `height` override on the strip.
>   - Kept strip background transparent to avoid visual disconnects.

- 2026-02-20T13:24:38Z @tobiu added parent issue #9106
- 2026-02-20T13:24:51Z @tobiu closed this issue

