---
id: 8501
title: Implement Ticket Index Generation Script
state: CLOSED
labels:
  - ai
  - build
  - feature
assignees:
  - tobiu
createdAt: '2026-01-10T14:27:57Z'
updatedAt: '2026-01-10T14:32:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8501'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T14:32:53Z'
---
# Implement Ticket Index Generation Script

Create a new build script `buildScripts/createTicketIndex.mjs` to parse local markdown tickets and generate a structured JSON index for the Portal app.

**Scope:**
1.  **Source Parsing:** Scan `resources/content/issues` (active) and `resources/content/issue-archive` (archived).
2.  **Filtering:** Implement include/exclude logic based on labels (e.g., include `bug`, `feature`; exclude `chore`).
3.  **Output:** Generate `apps/portal/resources/data/tickets.json` containing a flat list of ticket metadata.
4.  **Integration:** Ensure the script can be run via `node`.

This is a sub-task of Epic #8398.

## Timeline

- 2026-01-10T14:27:59Z @tobiu added the `ai` label
- 2026-01-10T14:27:59Z @tobiu added the `build` label
- 2026-01-10T14:27:59Z @tobiu added the `feature` label
- 2026-01-10T14:28:10Z @tobiu added parent issue #8398
- 2026-01-10T14:32:03Z @tobiu referenced in commit `e9055d3` - "feat: Implement Ticket Index Generator and Integrate into Release Workflow (#8501)

- Added buildScripts/createTicketIndex.mjs to parse active and archived tickets
- Integrated ticket index generation into buildScripts/prepareRelease.mjs
- Generated initial apps/portal/resources/data/tickets.json"
### @tobiu - 2026-01-10T14:32:12Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the ticket index generation logic.
> 
> **Changes:**
> 1.  **Created `buildScripts/createTicketIndex.mjs`:**
>     -   Scans `resources/content/issues` and `resources/content/issue-archive`.
>     -   Filters tickets based on `INCLUDE_LABELS` (bug, feature, enhancement, documentation, epic, architecture, refactoring) and `EXCLUDE_LABELS` (chore, task, agent-task).
>     -   Generates a flat JSON structure in `apps/portal/resources/data/tickets.json`.
> 
> 2.  **Updated `buildScripts/prepareRelease.mjs`:**
>     -   Integrated `createTicketIndex()` to run immediately after `createReleaseIndex()`.
> 
> 3.  **Generated Initial Data:**
>     -   `apps/portal/resources/data/tickets.json` is now populated with ~2219 tickets.
> 
> Work committed and pushed to `dev`.
> 

- 2026-01-10T14:32:27Z @tobiu cross-referenced by #8398
- 2026-01-10T14:32:34Z @tobiu assigned to @tobiu
- 2026-01-10T14:32:53Z @tobiu closed this issue

