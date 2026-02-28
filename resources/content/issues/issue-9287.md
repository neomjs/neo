---
id: 9287
title: '[Documentation] Document the ''undefined'' sentinel value for reactive config initialization'
state: CLOSED
labels:
  - documentation
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-24T10:09:20Z'
updatedAt: '2026-02-24T10:10:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9287'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T10:10:57Z'
---
# [Documentation] Document the 'undefined' sentinel value for reactive config initialization

**Context**
The Neo.mjs config system relies on an elegant and highly performant architectural pattern for reactive configs: `undefined` acts as a strict, immutable sentinel value representing "initial instantiation". 

**The Problem**
If a developer is unaware of this, they might try to reset a config to `undefined` during the component's lifecycle. Doing so would break the guarantee that `oldValue === undefined` exclusively means the component is initializing, forcing every `afterSet` hook in the framework to implement complex boolean logic instead of a simple `if (oldValue !== undefined)` check.

**The Solution**
Update the JSDoc for `static config` in `src/core/Base.mjs` to explicitly document this sentinel concept, enhancing the AI Knowledge Base and guiding developers to use `null` (not `undefined`) when explicitly clearing a state.

## Timeline

- 2026-02-24T10:09:20Z @tobiu added the `documentation` label
- 2026-02-24T10:09:21Z @tobiu added the `ai` label
- 2026-02-24T10:09:21Z @tobiu added the `core` label
- 2026-02-24T10:09:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T10:09:56Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the JSDoc enhancement in `src/core/Base.mjs`.
> 
> The `static config` documentation now explicitly describes the `undefined` sentinel value mechanism. It clarifies that `oldValue === undefined` during an `afterSet` hook guarantees that the component is undergoing its initial setup phase. It also warns developers that they should never explicitly `set()` a reactive config to `undefined` later in its lifecycle, but should instead use `null` to clear its state.
> 
> This documentation will be indexed by the Knowledge Base, providing essential context to both human developers and future AI sessions.

- 2026-02-24T10:10:05Z @tobiu referenced in commit `408c83c` - "docs(core): Document the 'undefined' sentinel value for reactive config initialization (#9287)"
- 2026-02-24T10:10:57Z @tobiu closed this issue

