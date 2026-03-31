---
id: 9607
title: 'GridContainer: `this.items is not iterable` crash on initialization'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T10:33:30Z'
updatedAt: '2026-03-31T10:34:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9607'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T10:34:25Z'
---
# GridContainer: `this.items is not iterable` crash on initialization

The recent layout engine refactoring in #9487 introduced `headerWrapper` and `bodyWrapper` containers into `GridContainer`.
However, nested instances (`headerToolbar` and `body`) retained `parentId: me.id` injections from their `beforeSet...` pipelines. 
Consequently, the internal `Container.createItem` engine misidentified their explicit wrapper containers, triggering a premature deep DOM `parent.remove()` method against the still-initializing `GridContainer`. This caused a fatal `this.items is not iterable` exception as `GridContainer.items` defaults to `null` before finalization.

**Fix Details:**
Removed the explicit `parentId: me.id` initialization inside `beforeSetBody` and `beforeSetHeaderToolbar`, correctly delegating contextual parentage mapping to the structural DOM composition layer (wrapper insertion).

## Timeline

- 2026-03-31T10:33:31Z @tobiu added the `bug` label
- 2026-03-31T10:33:31Z @tobiu added the `ai` label
- 2026-03-31T10:33:32Z @tobiu added the `grid` label
- 2026-03-31T10:34:04Z @tobiu referenced in commit `545efc2` - "fix: Resolve container items collision during sub-grid wrapper instantiation (#9607)"
### @tobiu - 2026-03-31T10:34:11Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Pushed the fix to completely remove the isolated `parentId` property conflict during instantiation boundaries.
> 
> **Verification:**  
> Both stacktrace errors are eradicated:  
> 1. `remove` crash stemming from `GridContainer.items` defaults  
> 2. `removeDom` misread originating from `Viewport` resolving an uninstantiated config object due to `#1`.

- 2026-03-31T10:34:23Z @tobiu assigned to @tobiu
- 2026-03-31T10:34:25Z @tobiu closed this issue

