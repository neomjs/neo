---
id: 8242
title: '[Neural Link] Implement toJSON in data.Store'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T16:01:51Z'
updatedAt: '2025-12-31T16:10:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8242'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T16:10:11Z'
---
# [Neural Link] Implement toJSON in data.Store

Implement the `toJSON` method in `src/data/Store.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()` (which includes filters, sorters, count)
- `autoInitRecords`
- `autoLoad`
- `currentPage`
- `initialChunkSize`
- `isGrouped`
- `isLoaded`
- `isLoading`
- `model`: The model class name or config
- `pageSize`
- `remoteFilter`
- `remoteSort`
- `totalCount`
- `url`

**Note:** We are **NOT** serializing the `data` array here, as `Collection.toJSON` already excludes `items` to avoid performance issues. Data inspection is a separate concern.

## Timeline

- 2025-12-31T16:01:52Z @tobiu added the `enhancement` label
- 2025-12-31T16:01:52Z @tobiu added the `ai` label
- 2025-12-31T16:02:01Z @tobiu added parent issue #8200
- 2025-12-31T16:04:40Z @tobiu assigned to @tobiu
- 2025-12-31T16:08:54Z @tobiu referenced in commit `35f26b6` - "feat(data): Implement toJSON in Model and Store for Neural Link (#8241, #8242)"
### @tobiu - 2025-12-31T16:09:43Z

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/data/Store.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     autoInitRecords : this.autoInitRecords,
>     autoLoad        : this.autoLoad,
>     currentPage     : this.currentPage,
>     initialChunkSize: this.initialChunkSize,
>     isGrouped       : this.isGrouped,
>     isLoaded        : this.isLoaded,
>     isLoading       : this.isLoading,
>     model           : this.model?.toJSON(), // Recursive serialization of the model
>     pageSize        : this.pageSize,
>     remoteFilter    : this.remoteFilter,
>     remoteSort      : this.remoteSort,
>     totalCount      : this.totalCount,
>     url             : this.url
> }
> ```
> **Note:** As with `Collection`, we deliberately exclude the record data itself from this serialization to prevent performance issues with large datasets. Data inspection should use `getRecord` or other specialized tools.

- 2025-12-31T16:10:12Z @tobiu closed this issue
- 2025-12-31T16:33:16Z @tobiu referenced in commit `c3bd5ac` - "docs(issue): Close tickets #8241, #8242"

