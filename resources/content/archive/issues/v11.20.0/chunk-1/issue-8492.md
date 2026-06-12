---
id: 8492
title: Fix missing error flag in defragChromaDB extraction loop
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-10T01:07:30Z'
updatedAt: '2026-01-10T01:10:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8492'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T01:10:50Z'
---
# Fix missing error flag in defragChromaDB extraction loop

**Goal**:
Ensure that errors during the extraction phase properly trigger the safety abort mechanism.

**Issue**:
Currently, if an exception occurs during the extraction loop (Step 3), the error is logged but `extractionErrors` is not set to `true`. This allows the script to proceed to the destructive "Nuke" phase (Step 4) even if data extraction failed, potentially leading to data loss.

**Fix**:
Set `extractionErrors = true` within the `catch` block of the extraction loop.

**Why**:
To prevent accidental data loss by ensuring the "Nuke and Pave" process aborts if the backup/extraction phase is incomplete.

## Timeline

- 2026-01-10T01:07:31Z @tobiu added the `bug` label
- 2026-01-10T01:07:31Z @tobiu added the `ai` label
- 2026-01-10T01:07:31Z @tobiu added the `build` label
- 2026-01-10T01:10:17Z @tobiu referenced in commit `3d4f2ca` - "fix: Set error flag on extraction failure in defragChromaDB (#8492)"
- 2026-01-10T01:10:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T01:10:37Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix.
> The script now correctly sets `extractionErrors = true` when an exception is caught during the data extraction phase. This ensures the safety mechanism works as intended, aborting the process before any destructive actions are taken if the backup/extraction is incomplete.

- 2026-01-10T01:10:50Z @tobiu closed this issue

