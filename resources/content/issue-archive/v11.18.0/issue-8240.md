---
id: 8240
title: '[Neural Link] Implement toJSON in collection.Sorter'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:50:45Z'
updatedAt: '2025-12-31T15:58:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8240'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:58:20Z'
---
# [Neural Link] Implement toJSON in collection.Sorter

Implement the `toJSON` method in `src/collection/Sorter.mjs` to support the Neural Link serialization protocol.

It should wrap the existing `export()` method or return a similar object:
- `direction`
- `property`

## Comments

### @tobiu - 2025-12-31 15:57

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/collection/Sorter.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     direction: this.direction,
>     property : this.property
> }
> ```
> This includes the full reactive state, independent of the `export()` method.

## Activity Log

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label
- 2025-12-31 @tobiu added parent issue #8200
- 2025-12-31 @tobiu referenced in commit `e34a2ad` - "feat(collection): Implement toJSON in Collection, Filter, and Sorter for Neural Link (#8238, #8239, #8240)"
- 2025-12-31 @tobiu assigned to @tobiu
- 2025-12-31 @tobiu closed this issue
- 2025-12-31 @tobiu referenced in commit `ad471ec` - "docs(issue): Close tickets #8238, #8239, #8240"

