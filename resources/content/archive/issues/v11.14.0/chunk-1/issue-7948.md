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
- 2026-04-19T11:35:15Z @tobiu cross-referenced by PR #10091
- 2026-04-19T11:44:09Z @tobiu cross-referenced by #10092
- 2026-04-19T11:56:56Z @tobiu referenced in commit `386073d` - "fix(github-workflow): sentinel sweep for comment-deletion drift (#10092)

Delta-sync uses issue.updatedAt as its invalidation signal, and GitHub does
NOT bump updatedAt when a comment is deleted. Affected local files keep stale
commentsCount + stale comment bodies indefinitely — the mode that kept #9535
frozen for weeks during the #10090 investigation. GraphQL exposes no
ISSUE_COMMENT_DELETED_EVENT, so the timeline-scan pattern from #7948 (for
sub-issue/blocking relationship drift) does not transfer here.

Fix (option B from the ticket): add a totals-only sentinel pass that runs
after the delta pull inside runFullSync. For every tracked issue it compares
live `comments.totalCount` against the stored `commentsTotal` sentinel.
Mismatches are force-refetched via the recovery primitive introduced in
#10090. No new API surface, no polling, no `since:` filter — one batched
GraphQL request per ~100 issues at ~1 rate-limit unit per batch.

Changes:
- issueQueries: add `buildIssueTotalsBatchQuery(numbers)` — function
  export (not a static template) that composes aliased GraphQL fields
  (issue42: issue(number:42) { comments { totalCount } }) for N issues in
  one request.
- IssueSyncer: add `detectStaleCommentsCounts(metadata)` primitive. Lazily
  seeds missing `commentsTotal` entries in place without triggering a
  refetch so pre-migration metadata graduates cleanly; otherwise records
  stale entries for downstream recovery. Metadata writes in pullFromGitHub
  and refetchIssuesByNumber now capture `commentsTotal` alongside
  `contentHash`.
- MetadataManager: persist `commentsTotal` in the pruned issue metadata.
- SyncService: wire the sweep in runFullSync after the delta pull, pipe
  mismatches into refetchIssuesByNumber, surface checked/stale/seeded/errors
  counts in final log + return-stats.
- config.template: add `staleCommentsBatchSize: 100` knob.
- IssueSyncer.spec: three new Playwright cases — lazy seeding on fresh
  metadata, no-drift happy path, drift detection of the 11→10 pattern from
  #9535.

Live GraphQL probe against real repo confirms the aliased batch query
works end-to-end at cost=1 per 5-issue batch.

Follow-ups (captured in review, not in scope here):
- Per-number error isolation: GraphQL `issue(number:N)` errors hard if N
  is a PR instead of an Issue, which currently fails the entire batch.
  metadata.issues excludes PRs by contract so this is a theoretical edge,
  but per-alias error tolerance would be more defensive."
- 2026-04-19T12:00:04Z @tobiu cross-referenced by PR #10093
- 2026-04-19T12:03:48Z @tobiu referenced in commit `88307bf` - "fix(github-workflow): sentinel sweep for comment-deletion drift (#10092) (#10093)

Delta-sync uses issue.updatedAt as its invalidation signal, and GitHub does
NOT bump updatedAt when a comment is deleted. Affected local files keep stale
commentsCount + stale comment bodies indefinitely — the mode that kept #9535
frozen for weeks during the #10090 investigation. GraphQL exposes no
ISSUE_COMMENT_DELETED_EVENT, so the timeline-scan pattern from #7948 (for
sub-issue/blocking relationship drift) does not transfer here.

Fix (option B from the ticket): add a totals-only sentinel pass that runs
after the delta pull inside runFullSync. For every tracked issue it compares
live `comments.totalCount` against the stored `commentsTotal` sentinel.
Mismatches are force-refetched via the recovery primitive introduced in
#10090. No new API surface, no polling, no `since:` filter — one batched
GraphQL request per ~100 issues at ~1 rate-limit unit per batch.

Changes:
- issueQueries: add `buildIssueTotalsBatchQuery(numbers)` — function
  export (not a static template) that composes aliased GraphQL fields
  (issue42: issue(number:42) { comments { totalCount } }) for N issues in
  one request.
- IssueSyncer: add `detectStaleCommentsCounts(metadata)` primitive. Lazily
  seeds missing `commentsTotal` entries in place without triggering a
  refetch so pre-migration metadata graduates cleanly; otherwise records
  stale entries for downstream recovery. Metadata writes in pullFromGitHub
  and refetchIssuesByNumber now capture `commentsTotal` alongside
  `contentHash`.
- MetadataManager: persist `commentsTotal` in the pruned issue metadata.
- SyncService: wire the sweep in runFullSync after the delta pull, pipe
  mismatches into refetchIssuesByNumber, surface checked/stale/seeded/errors
  counts in final log + return-stats.
- config.template: add `staleCommentsBatchSize: 100` knob.
- IssueSyncer.spec: three new Playwright cases — lazy seeding on fresh
  metadata, no-drift happy path, drift detection of the 11→10 pattern from
  #9535.

Live GraphQL probe against real repo confirms the aliased batch query
works end-to-end at cost=1 per 5-issue batch.

Follow-ups (captured in review, not in scope here):
- Per-number error isolation: GraphQL `issue(number:N)` errors hard if N
  is a PR instead of an Issue, which currently fails the entire batch.
  metadata.issues excludes PRs by contract so this is a theoretical edge,
  but per-alias error tolerance would be more defensive."
- 2026-04-19T12:20:06Z @tobiu cross-referenced by #10094
- 2026-04-19T21:40:56Z @tobiu cross-referenced by #10110
- 2026-04-19T21:53:35Z @tobiu cross-referenced by PR #10111

