---
id: 8397
title: Add support for automatic GitHub issue linking in Markdown component
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T21:06:20Z'
updatedAt: '2026-01-07T21:14:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8397'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T21:14:32Z'
---
# Add support for automatic GitHub issue linking in Markdown component

Enhance `Neo.component.Markdown` to automatically convert GitHub issue references (e.g., `#123`) into clickable links.

1.  **New Configs:**
    *   `replaceTicketIds`: (Boolean, default `false`) - Toggles the feature.
    *   `repoIssuesUrl`: (String, default `'https://github.com/neomjs/neo/issues/'`) - The base URL for issues.

2.  **Implementation:**
    *   Add a regex to identify issue references: `/(^|\s)#(\d+)\b/g`.
    *   In `modifyMarkdown`, if `replaceTicketIds` is true, replace matches with `<a href="...">#...</a>`.
    *   Ensure the replacement preserves leading whitespace.

3.  **Usage:**
    *   Enable this config in the Portal application for release notes.

## Timeline

- 2026-01-07T21:06:21Z @tobiu added the `enhancement` label
- 2026-01-07T21:06:22Z @tobiu added the `ai` label
- 2026-01-07T21:06:30Z @tobiu added parent issue #8362
- 2026-01-07T21:06:50Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-07T21:14:13Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the automatic issue linking feature.
> 
> **Changes:**
> 1.  **New Configs:** Added `replaceTicketIds` (default `false`) and `issuesUrl` (default `https://github.com/neomjs/neo/issues/`) to `Neo.component.Markdown`.
> 2.  **Implementation:** Updated `modifyMarkdown` to regex-replace `#123` with clickable links when enabled. The regex `/(^|[\s(])#(\d+)\b/g` handles start-of-line, whitespace, and parentheses delimiters (e.g. `(#123)`).
> 3.  **Portal Integration:** Enabled `replaceTicketIds: true` in `apps/portal/view/shared/content/Component.mjs`, ensuring all portal content (Release Notes, Blog, Docs) automatically links ticket references.
> 
> This feature is now active.

- 2026-01-07T21:14:33Z @tobiu closed this issue
- 2026-01-07T22:11:57Z @tobiu referenced in commit `31cc663` - "feat: Enhance Markdown parser (implicit readonly, ticket linking) (#8396, #8397)"

