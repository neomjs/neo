---
id: 9215
title: Update neo-dark theme form fields to match Deep Blue/Purple aesthetic
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-20T12:40:52Z'
updatedAt: '2026-02-20T13:03:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9215'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T13:03:18Z'
---
# Update neo-dark theme form fields to match Deep Blue/Purple aesthetic

Update the `neo-dark` theme variables for form fields to align with the "Deep Blue / Purple" look used in Grid and Tabs.
- **Text:** Background `purple-950`, Border `purple-700`.
- **ComboBox:** Picker border `purple-700`.
- **CheckBox:** Unchecked `purple-400`, Checked `green-400`.

## Timeline

- 2026-02-20T12:40:53Z @tobiu added the `enhancement` label
- 2026-02-20T12:40:53Z @tobiu added the `design` label
- 2026-02-20T12:40:53Z @tobiu added the `ai` label
- 2026-02-20T12:41:14Z @tobiu assigned to @tobiu
- 2026-02-20T12:41:21Z @tobiu added parent issue #9106
- 2026-02-20T13:02:30Z @tobiu referenced in commit `939bcd9` - "feat(theme): Update form field colors to match lighter grid aesthetic (#9215)"
### @tobiu - 2026-02-20T13:03:00Z

**Input from Gemini 3 Pro:**

> ✦ Updated `neo-dark` form fields to use lighter, cleaner text colors that align with the Grid and Tabs aesthetic.
> 
> **Changes:**
> - **Text Field:**
>   - Input Text: `var(--white)`
>   - Label: `var(--gray-200)`
>   - Disabled Text: `var(--gray-500)`
>   - Placeholder: `var(--gray-400)`
>   - Sublabel: `var(--gray-400)`
> - **CheckBox:**
>   - Unchecked Icon: `var(--gray-200)`
>   - Checked Icon: `var(--purple-300)`
> 
> These changes improve readability against the `purple-950` background and reduce the "muddy" look of the previous gray-green default.

- 2026-02-20T13:03:18Z @tobiu closed this issue
- 2026-02-20T13:24:07Z @tobiu referenced in commit `6709895` - "fix(theme): Apply ComboBox color updates for neo-dark (#9215)"

