---
id: 8234
title: '[Neural Link] Implement toJSON in layout.Flexbox'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:18:44Z'
updatedAt: '2025-12-31T15:20:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8234'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:20:10Z'
---
# [Neural Link] Implement toJSON in layout.Flexbox

Implement the `toJSON` method in `src/layout/Flexbox.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `align`
- `direction`
- `gap`
- `pack`
- `prefix`
- `wrap`

Note: `Neo.layout.HBox` and `Neo.layout.VBox` extend `Flexbox`, so they will automatically inherit this serialization.

## Comments

### @tobiu - 2025-12-31 15:19

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/layout/Flexbox.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     align    : this.align,
>     direction: this.direction,
>     gap      : this.gap,
>     pack     : this.pack,
>     prefix   : this.prefix,
>     wrap     : this.wrap
> }
> ```
> This serialization is also inherited by `Neo.layout.HBox` and `Neo.layout.VBox`.

## Activity Log

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label
- 2025-12-31 @tobiu added parent issue #8200
- 2025-12-31 @tobiu assigned to @tobiu
- 2025-12-31 @tobiu referenced in commit `de7c530` - "feat(layout): Implement toJSON in Neo.layout.Flexbox for Neural Link serialization (#8234)"
- 2025-12-31 @tobiu closed this issue

