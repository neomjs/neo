---
id: 7948
title: 'Enhancement: Timeline-Based Relationship Discovery for Issue Sync'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T12:28:38Z'
updatedAt: '2025-11-30T12:41:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7948'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T12:41:45Z'
---
# Enhancement: Timeline-Based Relationship Discovery for Issue Sync

## Context
We recently implemented a "Child-Triggered Parent Refresh" strategy to fix sync gaps where adding a sub-issue didn't update the parent's `updatedAt` timestamp. This works well for parent-child relationships.

## Problem
The current logic *only* checks `issue.parent`. It does not handle:
1.  **Blocking Relationships:** If Issue A blocks Issue B, and only A is updated/fetched, B's local file might remain stale (missing the "Blocked by A" entry) if GitHub doesn't bump B's `updatedAt`.
2.  **Edge Cases:** Any other relationship change where the "other side" isn't automatically flagged as modified by GitHub.

## Proposed Solution: Timeline-Based Discovery
Extend the post-processing logic in `IssueSyncer.mjs` to scan the `timelineItems` of all *fetched* issues.

1.  **Scan Events:** Iterate through `allIssues` (the ones just pulled).
2.  **Filter Events:** Look for relationship events (`SUB_ISSUE_ADDED`, `BLOCKED_BY_ADDED`, etc.) that occurred *since the last sync*.
3.  **Collect IDs:** Extract the IDs of the related issues (`event.subIssue.number`, `event.blockingIssue.number`, etc.).
4.  **Force Update:** Add these IDs to the `forceUpdate` set (merging with the existing `issue.parent` logic).

## Implementation
Refactor the `parentIdsToUpdate` logic into a broader `relatedIssuesToUpdate` set.

```javascript
const relatedIssuesToUpdate = new Set();

allIssues.forEach(issue => {
    // 1. Existing Parent Check
    if (issue.parent) {
        relatedIssuesToUpdate.add(issue.parent.number);
    }

    // 2. New Timeline Scan
    const relationshipEvents = issue.timelineItems?.nodes.filter(event => 
        ['SUB_ISSUE_ADDED_EVENT', 'BLOCKED_BY_ADDED_EVENT', /* ... all types */].includes(event.__typename) &&
        new Date(event.createdAt) > new Date(metadata.lastSync)
    );

    relationshipEvents?.forEach(event => {
        if (event.subIssue) relatedIssuesToUpdate.add(event.subIssue.number);
        if (event.parent) relatedIssuesToUpdate.add(event.parent.number);
        if (event.blockingIssue) relatedIssuesToUpdate.add(event.blockingIssue.number);
        if (event.blockedIssue) relatedIssuesToUpdate.add(event.blockedIssue.number);
    });
});
```

This ensures complete referential integrity for all relationship types.

## Timeline

- 2025-11-30T12:28:39Z @tobiu added the `enhancement` label
- 2025-11-30T12:28:40Z @tobiu added the `ai` label
- 2025-11-30T12:29:18Z @tobiu assigned to @tobiu
- 2025-11-30T12:41:37Z @tobiu referenced in commit `64b36f5` - "Enhancement: Timeline-Based Relationship Discovery for Issue Sync #7948"
- 2025-11-30T12:41:45Z @tobiu closed this issue

