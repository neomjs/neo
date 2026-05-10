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

## Timeline

- 2025-12-31T15:18:46Z @tobiu added the `enhancement` label
- 2025-12-31T15:18:46Z @tobiu added the `ai` label
- 2025-12-31T15:18:54Z @tobiu added parent issue #8200
- 2025-12-31T15:19:27Z @tobiu assigned to @tobiu
- 2025-12-31T15:19:50Z @tobiu referenced in commit `de7c530` - "feat(layout): Implement toJSON in Neo.layout.Flexbox for Neural Link serialization (#8234)"
### @tobiu - 2025-12-31T15:19:51Z

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

- 2025-12-31T15:20:11Z @tobiu closed this issue
- 2025-12-31T15:22:57Z @tobiu referenced in commit `938ace2` - "docs(issue): Close ticket #8234"

