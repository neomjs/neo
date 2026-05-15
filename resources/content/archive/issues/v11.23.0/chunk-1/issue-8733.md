---
id: 8733
title: Implement Dark Theme for Container and Form Components
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T21:15:46Z'
updatedAt: '2026-01-16T21:22:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8733'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T21:22:03Z'
---
# Implement Dark Theme for Container and Form Components

We need to update `resources/scss/theme-neo-dark/container/*.scss` and `resources/scss/theme-neo-dark/form/**/*.scss` to use dark theme semantic tokens and replace hardcoded light theme colors.

**Scope:**
- `container/Accordion.scss`
- `container/AccordionItem.scss`
- `container/Viewport.scss`
- `form/Fieldset.scss`
- `form/field/Text.scss`
- `form/field/CheckBox.scss`
- `form/field/Picker.scss`
- `form/field/Switch.scss`
- `form/field/trigger/Base.scss`
- `form/field/trigger/Time.scss`

**Task:**
Replace hardcoded hex/named colors with `var(--sem-color-...)` variables or appropriate dark theme values.

## Timeline

- 2026-01-16T21:15:48Z @tobiu added the `enhancement` label
- 2026-01-16T21:15:48Z @tobiu added the `design` label
- 2026-01-16T21:15:48Z @tobiu added the `ai` label
- 2026-01-16T21:21:30Z @tobiu referenced in commit `4c4f4c4` - "feat: Implement Dark Theme for Container and Form Components (#8733)

- Update Accordion, AccordionItem, Viewport, Fieldset, Text, CheckBox, Picker, Switch, and Triggers SCSS
- Replace hardcoded light theme colors with dark theme semantic and core tokens"
### @tobiu - 2026-01-16T21:21:34Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the update of container and form components for the dark theme.
> 
> **Changes:**
> - **Accordion & AccordionItem**: Mapped to dark surface and border tokens.
> - **Viewport**: Updated background color to `neutral-default`.
> - **Fieldset**: Updated background, border, and legend colors.
> - **Text Field**: Comprehensive update for input backgrounds, text colors, and borders (default, active, invalid, disabled).
> - **CheckBox**: Mapped to dark icon tokens.
> - **Picker**: Updated container background and shadow.
> - **Switch**: Mapped toggle colors to blue/gray spectrum for dark mode.
> - **Triggers**: Updated hover states and icon colors.
> 
> The form and container components are now aligned with the dark theme system.

- 2026-01-16T21:21:41Z @tobiu assigned to @tobiu
- 2026-01-16T21:21:48Z @tobiu added parent issue #8727
- 2026-01-16T21:22:03Z @tobiu closed this issue

