---
id: 8235
title: '[Neural Link] Implement toJSON in layout.Card'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:22:03Z'
updatedAt: '2025-12-31T15:39:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8235'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:23:26Z'
---
# [Neural Link] Implement toJSON in layout.Card

Implement the `toJSON` method in `src/layout/Card.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `activeIndex`: The currently active card index
- `containerCls`: The container CSS class (e.g., 'neo-layout-card')
- `removeInactiveCards`: Whether inactive cards are removed from DOM
- `slideDirection`: The direction of the slide animation

## Timeline

- 2025-12-31T15:22:04Z @tobiu added the `enhancement` label
- 2025-12-31T15:22:04Z @tobiu added the `ai` label
- 2025-12-31T15:22:13Z @tobiu added parent issue #8200
- 2025-12-31T15:22:57Z @tobiu referenced in commit `d2595a8` - "feat(layout): Implement toJSON in Neo.layout.Card for Neural Link serialization (#8235)"
### @tobiu - 2025-12-31T15:23:09Z

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/layout/Card.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     activeIndex        : this.activeIndex,
>     containerCls       : this.containerCls,
>     removeInactiveCards: this.removeInactiveCards,
>     slideDirection     : this.slideDirection
> }
> ```

- 2025-12-31T15:23:26Z @tobiu closed this issue
- 2025-12-31T15:39:58Z @tobiu assigned to @tobiu
- 2025-12-31T15:40:37Z @tobiu referenced in commit `0bb6d69` - "docs(issue): Close ticket #8235"

