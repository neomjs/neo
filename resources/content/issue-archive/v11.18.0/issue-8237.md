---
id: 8237
title: '[Neural Link] Implement toJSON in layout.Cube'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:42:34Z'
updatedAt: '2025-12-31T15:44:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8237'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:44:20Z'
---
# [Neural Link] Implement toJSON in layout.Cube

Implement the `toJSON` method in `src/layout/Cube.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `activeFace`
- `activeIndex`
- `fitContainer`
- `hideInactiveCardsOnDestroy`
- `perspective`
- `rotateX`, `rotateY`, `rotateZ`
- `sideX`, `sideY`, `sideZ`

## Timeline

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label
- 2025-12-31 @tobiu added parent issue #8200
- 2025-12-31 @tobiu assigned to @tobiu
- 2025-12-31 @tobiu referenced in commit `c16eb25` - "feat(layout): Implement toJSON in Neo.layout.Cube for Neural Link serialization (#8237)"
### @tobiu - 2025-12-31 15:44

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/layout/Cube.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     activeFace                : this.activeFace,
>     activeIndex               : this.activeIndex,
>     fitContainer              : this.fitContainer,
>     hideInactiveCardsOnDestroy: this.hideInactiveCardsOnDestroy,
>     perspective               : this.perspective,
>     rotateX                   : this.rotateX,
>     rotateY                   : this.rotateY,
>     rotateZ                   : this.rotateZ,
>     sideX                     : this.sideX,
>     sideY                     : this.sideY,
>     sideZ                     : this.sideZ
> }
> ```

- 2025-12-31 @tobiu closed this issue
- 2025-12-31 @tobiu referenced in commit `5b0234a` - "docs(issue): Close ticket #8237"

