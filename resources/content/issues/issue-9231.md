---
id: 9231
title: 'DevIndex: Implement Issue-Template-Based Opt-Out mechanism'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T15:23:35Z'
updatedAt: '2026-02-21T22:07:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9231'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T22:07:40Z'
---
# DevIndex: Implement Issue-Template-Based Opt-Out mechanism

### Description
Implement a secondary, explicit opt-out mechanism using GitHub issues. Users can create an issue using a specific template to request removal from the DevIndex.

### Requirements
1. **Issue Template**:
   - Create a new GitHub issue template specifically for DevIndex opt-outs.
   - Apply a specific label (e.g., `devindex-opt-out`) to issues created with this template.
2. **Service Integration (`OptOut.mjs`)**:
   - Extend the newly created `OptOut.mjs` service to query for newly opened issues containing the `devindex-opt-out` label.
   - Use the issue author (`issue.user.login`) as the verified identity for the opt-out.
   - Apply the blacklisting logic (add to blacklist, remove from data stores).
3. **Cleanup (Privacy)**:
   - Provide a mechanism to immediately close and delete/hide the issue after processing to prevent permanent public association with the neo project.

## Timeline

- 2026-02-21T15:23:36Z @tobiu added the `enhancement` label
- 2026-02-21T15:23:36Z @tobiu added the `ai` label
- 2026-02-21T22:06:52Z @tobiu referenced in commit `00e8e90` - "feat(devindex): Implement Issue-Template-Based Opt-Out mechanism (#9231)"
- 2026-02-21T22:07:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T22:07:17Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the Issue-Template-Based Opt-Out mechanism.
> 
> ### Changes Made:
> - **`apps/devindex/services/OptOut.mjs`**: Extended the service to query the GraphQL API for open issues with the `devindex-opt-out` label in the `neomjs/devindex-opt-out` repository.
> - **Identity Verification**: The script extracts the issue author (`issue.author.login`) to ensure verifiable, authenticated opt-out requests.
> - **Processing Logic**: The script automatically appends the user to the blocklist, prunes them from the active index (`users.jsonl`, `tracker.json`, `failed.json`), leaves a detailed confirmation comment on the issue, and finally **closes the issue automatically**.
> - **State Management**: Bypassed timestamp tracking for issues in favor of relying strictly on GitHub's native `OPEN` state. This acts as an infallible, self-healing synchronization mechanism.
> 
> Changes pushed to `dev`. Closing this ticket as completed.

- 2026-02-21T22:07:41Z @tobiu closed this issue
- 2026-02-21T22:10:04Z @tobiu referenced in commit `8aff59f` - "docs(devindex): Update OptOut guide with Issue-Template-Based process (#9231)"

