---
id: 8236
title: '[Neural Link] Implement toJSON in layout.Form'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:38:59Z'
updatedAt: '2025-12-31T15:41:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8236'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:41:05Z'
---
# [Neural Link] Implement toJSON in layout.Form

Implement the `toJSON` method in `src/layout/Form.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `gap`

## Timeline

- 2025-12-31T15:39:00Z @tobiu added the `enhancement` label
- 2025-12-31T15:39:00Z @tobiu added the `ai` label
- 2025-12-31T15:39:14Z @tobiu added parent issue #8200
- 2025-12-31T15:40:07Z @tobiu assigned to @tobiu
- 2025-12-31T15:40:37Z @tobiu referenced in commit `4c9e8b7` - "feat(layout): Implement toJSON in Neo.layout.Form for Neural Link serialization (#8236)"
### @tobiu - 2025-12-31T15:40:48Z

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/layout/Form.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     gap: this.gap
> }
> ```

- 2025-12-31T15:41:05Z @tobiu closed this issue
- 2025-12-31T15:43:56Z @tobiu referenced in commit `0001f48` - "docs(issue): Close ticket #8236"

