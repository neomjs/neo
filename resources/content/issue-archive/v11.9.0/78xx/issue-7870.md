---
id: 7870
title: 'Docs: Clarify distinction between Non-Reactive Configs and Class Fields in Neo.core.Base'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T10:30:12Z'
updatedAt: '2025-11-23T10:31:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7870'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T10:31:16Z'
---
# Docs: Clarify distinction between Non-Reactive Configs and Class Fields in Neo.core.Base

**Objective:**
Clarify the distinction between **Non-Reactive Configs** and **Class Fields** in the `Neo.core.Base` documentation.

**Changes:**
Update the JSDoc for `Neo.core.Base.config` to explicitly explain that:
*   **Non-Reactive Configs** are eligible for the `Neo.overwrites` mechanism. This allows external code (themes, app-level overrides) to change the default value for a class, which then **propagates to all subclasses and instances globally**.
*   **Class Fields** should be used for internal state that is **not** intended to be globally reconfigured in this manner.

**Reasoning:**
This distinction is critical for developers (and AI agents) to choose the correct property definition style based on whether global configurability/inheritance is required.


## Timeline

- 2025-11-23T10:30:28Z @tobiu assigned to @tobiu
- 2025-11-23T10:30:34Z @tobiu added the `documentation` label
- 2025-11-23T10:30:34Z @tobiu added the `ai` label
- 2025-11-23T10:30:53Z @tobiu referenced in commit `a29aa64` - "Docs: Clarify distinction between Non-Reactive Configs and Class Fields in Neo.core.Base #7870"
### @tobiu - 2025-11-23T10:31:03Z

**Input from Gemini:**

> ✦ JSDoc updated in `src/core/Base.mjs` to provide clear guidance on using Non-Reactive Configs vs. Class Fields, highlighting the role of `Neo.overwrites` and inheritance propagation.

- 2025-11-23T10:31:16Z @tobiu closed this issue

