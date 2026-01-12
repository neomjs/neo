---
id: 8238
title: '[Neural Link] Implement toJSON in collection.Base'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:49:44Z'
updatedAt: '2025-12-31T15:57:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8238'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:57:57Z'
---
# [Neural Link] Implement toJSON in collection.Base

Implement the `toJSON` method in `src/collection/Base.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `count`
- `keyProperty`
- `sourceId`
- `filters` (serialized via `toJSON` or `export`)
- `sorters` (serialized via `toJSON` or `export`)

**Decision:** We will **NOT** serialize the full `items` array in `toJSON` to avoid performance issues with large datasets (e.g., buffered grids). Data inspection should be handled by specialized tools fetching data on demand.

## Timeline

- 2025-12-31T15:49:45Z @tobiu added the `enhancement` label
- 2025-12-31T15:49:45Z @tobiu added the `ai` label
- 2025-12-31T15:50:25Z @tobiu added parent issue #8200
- 2025-12-31T15:56:41Z @tobiu referenced in commit `e34a2ad` - "feat(collection): Implement toJSON in Collection, Filter, and Sorter for Neural Link (#8238, #8239, #8240)"
- 2025-12-31T15:56:56Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-31T15:57:20Z

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/collection/Base.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     count      : this.count,
>     filters    : this.filters.map(filter => filter.toJSON()),
>     keyProperty: this.keyProperty,
>     sorters    : this.sorters.map(sorter => sorter.toJSON()),
>     sourceId   : this.sourceId
> }
> ```
> **Important:** We deliberately exclude `items` to avoid massive payloads. Data inspection should be handled via specialized tools or `getRecord` requests. Filters and sorters are recursively serialized.

- 2025-12-31T15:57:57Z @tobiu closed this issue
- 2025-12-31T15:59:07Z @tobiu referenced in commit `ad471ec` - "docs(issue): Close tickets #8238, #8239, #8240"

