---
id: 9231
title: 'DevIndex: Implement Issue-Template-Based Opt-Out mechanism'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-21T15:23:35Z'
updatedAt: '2026-02-21T15:23:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9231'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

