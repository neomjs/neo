---
id: 9134
title: Fix Organization Leakage in DevIndex and Updater Retries
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T02:06:01Z'
updatedAt: '2026-02-13T02:09:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9134'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T02:09:13Z'
---
# Fix Organization Leakage in DevIndex and Updater Retries

Organizations are leaking into the `tracker.json` index (e.g., `loomnetwork`), causing the Updater to waste cycles retrying queries that will never succeed.

**Root Cause (Spider):**
The `Network Walker` (and potentially other strategies) fetches lists of users (e.g., `following`) but does not filter out entities where `type === 'Organization'`.

**Symptom (Updater):**
When the Updater encounters these Orgs, `GitHub.mjs` misinterprets the "Could not resolve to a User" GraphQL error as a network error and retries it 3 times.

**Tasks:**
1.  **Spider.mjs:** Update `runNetworkWalker` (and `fetchContributors`) to strictly filter for `type: 'User'`.
2.  **GitHub.mjs:** Update error handling to Abort Retry immediately if the error contains "Could not resolve to a User" or "NOT_FOUND".

## Timeline

- 2026-02-13T02:06:02Z @tobiu added the `bug` label
- 2026-02-13T02:06:02Z @tobiu added the `ai` label
- 2026-02-13T02:06:20Z @tobiu assigned to @tobiu
- 2026-02-13T02:06:32Z @tobiu added parent issue #9106
- 2026-02-13T02:08:25Z @tobiu referenced in commit `a0b60fc` - "fix(devindex): Fix Organization leakage and prevent retry on 404s (#9134)"
### @tobiu - 2026-02-13T02:08:39Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fixes to prevent Organization leakage and stop wasteful retries.
> 
> **Changes:**
> 1.  **Spider (`Spider.mjs`):** Updated `runNetworkWalker` to strictly filter for `user.type === 'User'`. This prevents Organizations (like `loomnetwork`) from being added to the tracker when walking the social graph.
> 2.  **GitHub Service (`GitHub.mjs`):**
>     -   Updated the `if (json.errors)` block to check for "Could not resolve to a User" or "NOT_FOUND".
>     -   If found, it throws a `GraphQL Fatal Error` immediately, bypassing the retry logic.
>     -   Updated the `catch` block to explicitly re-throw these fatal errors, ensuring they don't get caught by the generic network retry handler.
> 
> This ensures that the DevIndex remains focused on *developers* and handles invalid entities gracefully without burning API quota on retries.

- 2026-02-13T02:09:13Z @tobiu closed this issue

