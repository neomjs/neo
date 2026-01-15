---
id: 8688
title: 'Fix: Correct Default Expansion Logic (Revert Release, Apply to Ticket Index)'
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-15T12:39:36Z'
updatedAt: '2026-01-15T12:46:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8688'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T12:46:35Z'
---
# Fix: Correct Default Expansion Logic (Revert Release, Apply to Ticket Index)

**Goal:** Correct the default expansion logic in the build scripts.

**Correction:**
The previous change to `buildScripts/createReleaseIndex.mjs` was incorrect; the intention was to apply this logic to the **Ticket Index** (`buildScripts/createTicketIndex.mjs`) because the first group in Tickets is "Backlog" (which should be collapsed), whereas the first group in Releases is the latest version (which should likely be expanded, or maybe the user wants Releases to stay as is).

**Tasks:**
1.  **Revert** `buildScripts/createReleaseIndex.mjs`: Set expansion back to `index === 0`.
2.  **Update** `buildScripts/createTicketIndex.mjs`: Change expansion logic to expand `index === 1` (the first real release) and collapse `index === 0` ("Backlog").

## Timeline

- 2026-01-15T12:39:37Z @tobiu added the `bug` label
- 2026-01-15T12:39:38Z @tobiu added the `ai` label
- 2026-01-15T12:39:38Z @tobiu added the `build` label
- 2026-01-15T12:42:07Z @tobiu referenced in commit `cf89c80` - "fix: Correct default expansion logic for Release and Ticket indices (#8688)"
- 2026-01-15T12:43:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T12:46:08Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the default expansion logic in the build scripts.
> 
> **Changes:**
> 1.  **Reverted `buildScripts/createReleaseIndex.mjs`:** The Release Notes tree now correctly expands the first major version group (index 0) by default.
> 2.  **Updated `buildScripts/createTicketIndex.mjs`:** The Ticket tree now expands the second group (index 1, the latest release) by default, keeping the "Backlog" (index 0) collapsed.
> 3.  **Data Regeneration:** Both `releases.json` and `tickets.json` have been updated with the correct `collapsed` states.
> 
> This ensures the user experience is intuitive: Release Notes show the latest version immediately, while Tickets hide the Backlog to focus on the active release work.

- 2026-01-15T12:46:35Z @tobiu closed this issue

