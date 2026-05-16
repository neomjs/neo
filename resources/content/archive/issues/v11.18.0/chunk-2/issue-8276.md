---
id: 8276
title: '[Neural Link] Implement toJSON in core.Observable'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:37:04Z'
updatedAt: '2026-01-03T20:26:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8276'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T20:26:31Z'
---
# [Neural Link] Implement toJSON in core.Observable

Implement `toJSON` in `src/core/Observable.mjs` to export the runtime event listeners.
Access the private event map (via `Object.getOwnPropertySymbols(this)` or by exposing it if necessary).
Map the listeners to a serializable format:
- `event`: 'click'
- `fn`: Function name or '[Function]'
- `scope`: Scope ID (if NeoInstance) or '[Object]'
- `id`: Event ID

This allows the Neural Link to inspect attached event handlers.

## Timeline

- 2026-01-01T18:37:06Z @tobiu added the `enhancement` label
- 2026-01-01T18:37:06Z @tobiu added the `ai` label
- 2026-01-01T18:37:23Z @tobiu added parent issue #8200
- 2026-01-01T18:47:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-03T20:26:05Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented `toJSON` in `src/core/Observable.mjs` to serialize runtime event listeners.
> I also enhanced `src/core/Base.mjs`'s `serializeConfig` method to serialize functions as `'[Function]'`, allowing for the complete serialization of event handler objects (including scope and ID).
> 
> Changes committed in `feat(core): Implement toJSON in Observable and enhance serializeConfig #8276`.

- 2026-01-03T20:26:05Z @tobiu referenced in commit `56e009d` - "feat(core): Implement toJSON in Observable and enhance serializeConfig #8276"
- 2026-01-03T20:26:31Z @tobiu closed this issue

