---
id: 8550
title: Enhance Neo.mergeDeepArrays to support deep merging of objects within arrays
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-11T16:19:12Z'
updatedAt: '2026-01-12T02:42:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8550'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T02:42:41Z'
---
# Enhance Neo.mergeDeepArrays to support deep merging of objects within arrays

We are enhancing the `Neo.mergeDeepArrays` method to support a smarter merge strategy for arrays containing objects.

**Current Behavior:**
The current implementation performs a set-based union for arrays, or simple replacement.

**New Behavior:**
The enhanced implementation will iterate through the source array and the new array.
1. It will attempt to match items based on an `id` or `name` property.
2. If a match is found, it will recursively deep merge the objects using `Neo.mergeDeepArrays`.
3. If no match is found by key, it will check for deep equality.
4. New items are appended.
5. Duplicates (by deep equality) are avoided.

This enhancement allows for extending configuration arrays (like `fields_` in Data Models) where subclasses can override or extend specific items from the parent class without redefining the entire array.

**Use Case:**
Allowing `Portal.model.TicketTimelineSection` to inherit `fields` from `Portal.model.ContentSection` and merge in new fields, while keeping the shared fields defined in the base class.


## Timeline

- 2026-01-11T16:19:13Z @tobiu added the `enhancement` label
- 2026-01-11T16:19:14Z @tobiu added the `ai` label
- 2026-01-11T16:19:14Z @tobiu added the `core` label
- 2026-01-11T16:21:07Z @tobiu referenced in commit `ebde5e0` - "feat: Enhance mergeDeepArrays to support object merging in arrays (#8550)

- Updates  to support merging array items by uid=501(tobiasuhlig) gid=20(staff) groups=20(staff),12(everyone),61(localaccounts),79(_appserverusr),80(admin),81(_appserveradm),98(_lpadmin),33(_appstore),100(_lpoperator),204(_developer),250(_analyticsusers),395(com.apple.access_ftp),398(com.apple.access_screensharing),399(com.apple.access_ssh),400(com.apple.access_remote_ae) or .
- Updates  to use  merge strategy for .
- Allows Models to inherit and extend fields from parent classes (applied to )."
- 2026-01-12T02:42:39Z @tobiu assigned to @tobiu
- 2026-01-12T02:42:41Z @tobiu closed this issue

