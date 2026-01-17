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
updatedAt: '2026-01-16T23:36:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8727'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues:
  - '[x] 8728 Implement Neo Dark Theme Tokens'
  - '[x] 8729 Update Portal Header Toolbar for Theme Switching'
  - '[x] 8730 Enable Neo Dark Theme in Portal Config'
  - '[x] 8731 Replicate Light Theme Structure to Dark Theme'
  - '[x] 8732 Implement Dark Theme for General Components'
  - '[x] 8733 Implement Dark Theme for Container and Form Components'
  - '[x] 8734 Implement Dark Theme for Data Views'
  - '[x] 8735 Implement Dark Theme for Navigation Components'
  - '[x] 8736 Implement Dark Theme for Complex Components'
  - '[x] 8737 Implement Dark Theme for Application Styles'
  - '[x] 8738 Refactor Portal App Source SCSS for Theming'
  - '[x] 8739 Implement Dark Theme for Portal Content Components'
  - '[x] 8740 Refactor Portal Header Toolbar for Dark Theme'
  - '[x] 8741 Refactor Portal App Subdirectories for Dark Theme'
  - '[x] 8742 Refactor Portal TabContainer for Dark Theme'
subIssuesCompleted: 15
subIssuesTotal: 15
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
- 2026-01-16T21:21:48Z @tobiu added sub-issue #8733
### @tobiu - 2026-01-16T21:23:36Z

**Input from Gemini 3 Pro:**

> ✦ **Progress Update: Dark Theme Implementation**
> 
> We have successfully established the dark theme infrastructure and updated the core form and container components.
> 
> **Completed:**
> - [x] **Infrastructure**: Created `theme-neo-dark` structure and replicated all SCSS files from `theme-neo-light`.
> - [x] **General Components**: Updated `Toast`, `Chip`, `StatusBadge`, `Process`, `Progress`, `Splitter`, `DateSelector`, `Video`, `BoxLabel`.
> - [x] **Containers**: Updated `Accordion`, `AccordionItem`, `Viewport`, `Panel`.
> - [x] **Forms**: Updated `Fieldset`, `Text`, `CheckBox`, `Picker`, `Switch`, `Triggers`.
> 
> **Remaining Work (To Be Done in Next Session):**
> The following component categories still contain hardcoded light-theme colors and need to be updated to use dark theme semantic tokens:
> 
> 1.  **Data Views**:
>     - `grid/` (Container, Body, Header)
>     - `table/` (Container, Body, Header)
>     - `list/` (Base)
>     - `tree/` (List)
> 
> 2.  **Navigation**:
>     - `tab/` (Container, Strip, Header)
>     - `menu/` (List, Panel)
>     - `toolbar/` (Base)
> 
> 3.  **Complex Components**:
>     - `calendar/` (Views, Containers)
>     - `dialog/` (Base)
>     - `tooltip/` (Base)
>     - `draggable/` (SortZones)
> 
> 4.  **Application Specifics**:
>     - `apps/` (Portal, Docs, etc. need review for specific overrides)
> 
> **Next Steps:**
> Start a new session to tackle the **Data Views** (`grid`, `table`, `list`, `tree`) as the next logical chunk.

- 2026-01-16T21:49:27Z @tobiu cross-referenced by #8734
- 2026-01-16T21:49:35Z @tobiu added sub-issue #8734
- 2026-01-16T21:54:11Z @tobiu cross-referenced by #8735
- 2026-01-16T21:54:23Z @tobiu added sub-issue #8735
- 2026-01-16T21:56:11Z @tobiu cross-referenced by #8736
- 2026-01-16T21:56:20Z @tobiu added sub-issue #8736
- 2026-01-16T21:59:46Z @tobiu cross-referenced by #8737
- 2026-01-16T21:59:53Z @tobiu added sub-issue #8737
- 2026-01-16T22:08:39Z @tobiu cross-referenced by #8738
- 2026-01-16T22:08:45Z @tobiu added sub-issue #8738
### @tobiu - 2026-01-16T22:22:32Z

**Input from Gemini 3 Pro:**

> ✦ **Progress Update & Handoff Instructions**
> 
> We have completed the implementation of dark theme support for all core component categories (Data Views, Navigation, Complex) and the main application overrides.
> 
> **Completed:**
> - [x] #8734 Data Views
> - [x] #8735 Navigation
> - [x] #8736 Complex Components
> - [x] #8737 Apps (Portal, Docs, AgentOS, Covid)
> 
> **In Progress: Portal App Refactoring (#8738)**
> We started refactoring the Portal App's source SCSS to support theming, but significant work remains. Many source files (e.g., in `shared/content/`) still use hardcoded hex values.
> 
> **Instructions for Next Session:**
> 1.  **Scan & Refactor**: Continue scanning `resources/scss/src/apps/portal/` (especially `shared/content/`) for hardcoded colors.
> 2.  **Strategy**:
>     - **Do NOT change the Light Theme**: Create app-specific CSS variables. In `resources/scss/theme-neo-light/apps/portal/...`, define these variables using the **original hardcoded hex values**.
>     - **Dark Theme Mapping**: In `resources/scss/theme-neo-dark/apps/portal/...`, map these same variables to our semantic tokens (e.g., `var(--sem-color-bg-neutral-default)`).
>     - **Flexibility**: This indirection allows us to tweak the dark theme implementation without risking any regressions in the default light theme.
> 
> **Next Targets:**
> - `resources/scss/src/apps/portal/shared/content/SectionsContainer.scss`
> - `resources/scss/src/apps/portal/shared/content/TreeList.scss`
> - Any other files in `src/apps/portal` with hardcoded colors.

- 2026-01-16T22:57:22Z @tobiu cross-referenced by #8739
- 2026-01-16T22:57:30Z @tobiu added sub-issue #8739
- 2026-01-16T23:15:14Z @tobiu cross-referenced by #8740
- 2026-01-16T23:15:37Z @tobiu added sub-issue #8740
- 2026-01-16T23:17:44Z @tobiu cross-referenced by #8741
- 2026-01-16T23:17:53Z @tobiu added sub-issue #8741
- 2026-01-16T23:32:08Z @tobiu cross-referenced by #8742
- 2026-01-16T23:32:17Z @tobiu added sub-issue #8742
### @tobiu - 2026-01-16T23:36:58Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete. All identified SCSS files in the Portal App have been updated to support theming via CSS variables.
> 
> **Summary of Refactoring:**
> *   **Core Components**: `shared/content/` (`SectionsContainer`, `TreeList`, `Container`, `PageContainer`)
> *   **Header**: `HeaderToolbar`
> *   **Sub-apps**: `about`, `services`, `home` (`BaseContainer`, `How`), `news` (`tickets/Component`)
> *   **Navigation**: `shared/TabContainer`
> 
> **Approach**:
> *   **Light Theme**: Variables map to original hardcoded hex values to ensure **zero visual regression**.
> *   **Dark Theme**: Variables map to semantic tokens (e.g., `--sem-color-bg-neutral-default`).
> 
> **Remaining**:
> *   `FooterContainer` (Black by design)
> *   `examples/List` & `medium/List` (Dark overlays by design)
> 
> We are now ready to tackle offscreen canvas theming in a separate effort.


