---
id: 9214
title: 'DevIndex: Style ControlsContainer Tabs to match Portal Theme'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-20T09:30:46Z'
updatedAt: '2026-02-20T12:35:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9214'
author: tobiu
commentsCount: 2
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T12:35:11Z'
---
# DevIndex: Style ControlsContainer Tabs to match Portal Theme

Style the `ControlsContainer` tabs in `DevIndex` to match the `Portal` app's look and feel.
- Reduce tab header height (aiming for < 48px, closer to 30px).
- Adjust padding (currently 7px 16px 6px is too much).
- Apply theme variables for dark/light modes.
- Create/update SCSS files in `resources/scss/theme-neo-*/apps/devindex/home/`.

## Timeline

- 2026-02-20T09:30:47Z @tobiu added the `enhancement` label
- 2026-02-20T09:30:47Z @tobiu added the `ai` label
- 2026-02-20T09:37:29Z @tobiu assigned to @tobiu
- 2026-02-20T12:28:55Z @tobiu referenced in commit `61dede2` - "feat(devindex): Style ControlsContainer Tabs to match Portal Theme (#9214)"
- 2026-02-20T12:33:34Z @tobiu referenced in commit `2855d42` - "fix(devindex): Set tab button pressed height to match inactive state (#9214)"
### @tobiu - 2026-02-20T12:33:45Z

**Input from Gemini 3 Pro:**

> ✦ I have pushed a fix for the pressed tab button height.
> - Set `--tab-button-height-pressed: 30px` to match the inactive state.
> - This ensures consistent height across all tab states.

### @tobiu - 2026-02-20T12:34:58Z

**Input from Gemini 3 Pro:**

> ✦ Completed the styling of the DevIndex ControlsContainer tabs to match the Portal theme.
> 
> **Changes:**
> 1.  **Component Logic:**
>     *   Added `devindex-tab-header-toolbar` CSS class to the `headerToolbar` config in `apps/devindex/view/home/ControlsContainer.mjs`.
> 
> 2.  **Theming:**
>     *   Created `resources/scss/theme-neo-dark/apps/devindex/home/ControlsContainer.scss` defining dark mode variables (e.g., `--devindex-tab-toolbar-bg`).
>     *   Created `resources/scss/theme-neo-light/apps/devindex/home/ControlsContainer.scss` defining light mode variables.
> 
> 3.  **Styling:**
>     *   Updated `resources/scss/src/apps/devindex/home/ControlsContainer.scss` to implement the new look.
>     *   Enforced a 30px height for both active and inactive tab buttons (`--tab-button-height` and `--tab-button-height-pressed`).
>     *   Adjusted padding and margins to fit the compact layout.

- 2026-02-20T12:35:12Z @tobiu closed this issue
- 2026-02-20T12:41:01Z @tobiu added parent issue #9106

