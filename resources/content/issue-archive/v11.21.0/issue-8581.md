---
id: 8581
title: Fix outdated ticket index in release workflow
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-12T10:13:23Z'
updatedAt: '2026-01-12T10:20:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8581'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T10:20:56Z'
---
# Fix outdated ticket index in release workflow

## Problem
In the release workflow (`publishRelease.mjs`), `createTicketIndex.mjs` is executed during the "Prepare" phase (Step 2). However, the `GH_SyncService.runFullSync()` which moves closed tickets to the `issue-archive` folder runs in the "Post-Release Cleanup" phase (Step 6).

This results in `tickets.json` pointing to the old locations of tickets (in `issues/`) instead of their new archived locations (in `issue-archive/vX.Y.Z/`), causing broken links in the Portal application.

## Solution
Regenerate the ticket index (`createTicketIndex.mjs`) in `publishRelease.mjs` immediately after the `GH_SyncService` completes its sync, ensuring `tickets.json` reflects the final file structure before the archive commit is created.


## Timeline

- 2026-01-12T10:13:24Z @tobiu added the `bug` label
- 2026-01-12T10:13:24Z @tobiu added the `ai` label
- 2026-01-12T10:20:26Z @tobiu referenced in commit `869691c` - "fix: Regenerate ticket index after archiving in release workflow (#8581)"
- 2026-01-12T10:20:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-12T10:20:42Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix by ensuring `createTicketIndex.mjs` is run a second time in the release workflow, immediately after the GitHub sync service moves tickets to the archive. This ensures `tickets.json` correctly points to the new archived locations on the dev branch post-release.
> 
> I also manually regenerated the `tickets.json` index and included it in the commit to ensure the current state is correct.

- 2026-01-12T10:20:56Z @tobiu closed this issue

