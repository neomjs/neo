---
id: 8241
title: '[Neural Link] Implement toJSON in data.Model'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T16:01:29Z'
updatedAt: '2025-12-31T16:10:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8241'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T16:10:00Z'
---
# [Neural Link] Implement toJSON in data.Model

Implement the `toJSON` method in `src/data/Model.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `fields`: A summary or the fields config
- `keyProperty`
- `storeId`
- `trackModifiedFields`

Note: Records (data items) already have a `toJSON` method implemented in `src/data/RecordFactory.mjs`.

## Comments

### @tobiu - 2025-12-31 16:09

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/data/Model.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     fields             : this.fields,
>     keyProperty        : this.keyProperty,
>     storeId            : this.storeId,
>     trackModifiedFields: this.trackModifiedFields
> }
> ```

## Activity Log

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label
- 2025-12-31 @tobiu added parent issue #8200
- 2025-12-31 @tobiu assigned to @tobiu
- 2025-12-31 @tobiu referenced in commit `35f26b6` - "feat(data): Implement toJSON in Model and Store for Neural Link (#8241, #8242)"
- 2025-12-31 @tobiu closed this issue
- 2025-12-31 @tobiu referenced in commit `c3bd5ac` - "docs(issue): Close tickets #8241, #8242"

