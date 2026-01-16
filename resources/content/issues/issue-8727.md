---
id: 8727
title: 'Epic: Portal App Dark Theme'
state: OPEN
labels:
  - enhancement
  - epic
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T20:34:08Z'
updatedAt: '2026-01-16T20:48:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8727'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8728 Implement Neo Dark Theme Tokens'
  - '[x] 8729 Update Portal Header Toolbar for Theme Switching'
  - '[x] 8730 Enable Neo Dark Theme in Portal Config'
  - '[x] 8731 Replicate Light Theme Structure to Dark Theme'
  - '[x] 8732 Implement Dark Theme for General Components'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
---
# Epic: Portal App Dark Theme

Implement a comprehensive Dark Theme for the Portal App, utilizing the Neo.mjs Design Token system to ensure maintainability and nesting capability.

**Child Tasks:**
1.  **Theme Infrastructure & Tokens**:
    *   Populate `resources/scss/theme-neo-dark`.
    *   Replicate the `design-tokens` structure from `theme-neo-light`.
    *   Invert the semantic mappings in `Semantic.scss` (e.g., map backgrounds to dark gray tokens).
2.  **Header Toolbar & Theme Switcher**:
    *   Update `apps/portal/view/HeaderToolbar.mjs`.
    *   Remove the Slack icon.
    *   Add a Theme Switcher button (Sun/Moon).
    *   Implement the switching logic in the controller.
3.  **Asset Updates**:
    *   Ensure the Neo.mjs logo and other assets are visible on dark backgrounds (use CSS filters or alternate assets).
4.  **Config Integration**:
    *   Update `apps/portal/neo-config.json` to include the new `neo-theme-neo-dark`.


## Timeline

- 2026-01-16T20:34:09Z @tobiu added the `enhancement` label
- 2026-01-16T20:34:09Z @tobiu added the `epic` label
- 2026-01-16T20:34:10Z @tobiu added the `design` label
- 2026-01-16T20:34:10Z @tobiu added the `ai` label
- 2026-01-16T20:34:45Z @tobiu added sub-issue #8728
- 2026-01-16T20:34:48Z @tobiu added sub-issue #8729
- 2026-01-16T20:35:31Z @tobiu added sub-issue #8730
- 2026-01-16T20:42:35Z @tobiu referenced in commit `432208e` - "feat: Implement Portal App Dark Theme Infrastructure (#8727)

- Create resources/scss/theme-neo-dark with inverted semantic tokens (#8728)
- Add Theme Switcher to HeaderToolbar and ViewportController (#8729)
- Enable neo-theme-neo-dark in neo-config.json (#8730)"
### @tobiu - 2026-01-16T20:43:08Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the implementation of the Portal App Dark Theme infrastructure and initial switching logic.
> 
> **Summary of Changes:**
> 1.  **Theme Infrastructure**:
>     *   Created `resources/scss/theme-neo-dark` and populated `design-tokens`.
>     *   Inverted `Semantic.scss` mappings to map semantic variables to dark core tokens (e.g., backgrounds are now `gray-900`).
>     *   Updated root selectors in `Core.scss`, `Semantic.scss`, and `Component.scss` to `.neo-theme-neo-dark`.
> 
> 2.  **UI Updates**:
>     *   Refactored `apps/portal/view/HeaderToolbar.mjs`:
>         *   Removed the Slack icon.
>         *   Added a "Switch Theme" button (Moon icon) with `handler: 'onSwitchTheme'`.
> 
> 3.  **Controller Logic**:
>     *   Updated `apps/portal/view/ViewportController.mjs` with `onSwitchTheme`.
>     *   The logic toggles `this.component.theme` between `neo-theme-neo-light` and `neo-theme-neo-dark`.
>     *   Updates the button icon dynamically (Sun/Moon).
> 
> 4.  **Configuration**:
>     *   Added `neo-theme-neo-dark` to `apps/portal/neo-config.json` to ensure the CSS is loaded.
> 
> The foundation is now in place. Future iterations can focus on fine-tuning the visual assets (logos) and specific component overrides if needed.

- 2026-01-16T20:48:51Z @tobiu assigned to @tobiu
- 2026-01-16T21:04:39Z @tobiu added sub-issue #8731
- 2026-01-16T21:09:26Z @tobiu added sub-issue #8732

