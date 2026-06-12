---
id: 8600
title: Preserve form field state in changeNodeName
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T14:14:47Z'
updatedAt: '2026-01-13T14:18:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8600'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T14:18:46Z'
---
# Preserve form field state in changeNodeName

We recently improved `Neo.main.DeltaUpdates.changeNodeName` to preserve child nodes and scroll state.
However, it currently only copies *attributes*. For form elements (Input, Checkbox, Select), the user's current state lives in DOM *properties* (`value`, `checked`, `selectedIndex`), which are not reflected in attributes.

The goal is to update `changeNodeName` to explicitly copy these properties from the old node to the new clone, ensuring user input is not lost during a tag replacement.

## Timeline

- 2026-01-13T14:14:48Z @tobiu added the `enhancement` label
- 2026-01-13T14:14:48Z @tobiu added the `ai` label
- 2026-01-13T14:14:48Z @tobiu added the `core` label
- 2026-01-13T14:17:51Z @tobiu assigned to @tobiu
- 2026-01-13T14:18:20Z @tobiu referenced in commit `1f8f26b` - "enhancement: Preserve form field state in changeNodeName (#8600)

Added logic to explicitly copy 'value', 'checked', and 'selectedIndex'
properties from the old node to the new clone. This ensures user input
is preserved when a form element's tag is changed."
### @tobiu - 2026-01-13T14:18:34Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `changeNodeName` to explicitly copy form field state properties.
> 
> **Changes:**
> Before replacing the old node, the method now checks and copies the following properties if they differ from the default:
> *   `value` (for Inputs, TextAreas, Selects)
> *   `checked` (for Checkboxes, Radios)
> *   `selectedIndex` (for Selects)
> 
> This ensures that user interaction state is preserved even if the wrapping tag or the element itself is technically replaced in the DOM. Changes pushed to `dev`.

- 2026-01-13T14:18:47Z @tobiu closed this issue

