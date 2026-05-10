---
id: 8303
title: '[Neural Link] Implement toJSON for AmChart and Monaco'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-03T21:08:08Z'
updatedAt: '2026-01-03T21:13:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8303'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T21:13:37Z'
---
# [Neural Link] Implement toJSON for AmChart and Monaco

Implement `toJSON` serialization for `Neo.component.wrapper.AmChart` and `Neo.component.wrapper.MonacoEditor`.

**AmChart Scope:**
- `chartConfig`
- `chartData`
- `chartType`
- `dataPath`
- `package`

**MonacoEditor Scope:**
- `editorConfig`
- `language`
- `theme`
- `value`

**Goal:**
Enable Neural Link to inspect chart definitions and editor content.

## Timeline

- 2026-01-03T21:08:09Z @tobiu added the `enhancement` label
- 2026-01-03T21:08:09Z @tobiu added the `ai` label
- 2026-01-03T21:09:16Z @tobiu assigned to @tobiu
- 2026-01-03T21:09:22Z @tobiu added parent issue #8200
- 2026-01-03T21:13:09Z @tobiu referenced in commit `60dc961` - "feat(wrapper): Implement toJSON for AmChart and MonacoEditor #8303"
### @tobiu - 2026-01-03T21:13:13Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented `toJSON` for `AmChart` and `MonacoEditor` to export their domain-specific configurations.
> 
> **AmChart:** Exports `chartConfig`, `chartData`, `chartType`, etc.
> **MonacoEditor:** Exports `value`, `language`, `editorTheme`, `options`, etc.
> 
> This enables the Neural Link (and Infinite Canvas agents) to inspect the content and definition of these complex components.
> 
> Changes committed in `feat(wrapper): Implement toJSON for AmChart and MonacoEditor #8303`.

- 2026-01-03T21:13:37Z @tobiu closed this issue

