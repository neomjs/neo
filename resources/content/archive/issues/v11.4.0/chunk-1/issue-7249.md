---
id: 7249
title: Automate GitHub Issue Creation
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-24T09:23:25Z'
updatedAt: '2025-11-15T09:45:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7249'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-15T09:45:18Z'
---
# Automate GitHub Issue Creation

To improve the autonomy of our development workflow, we will automate the process of creating a GitHub issue from a local ticket file. This eliminates the current manual steps of creating the issue on the GitHub website and copying the ID back into the local file.

## Goal

Implement a workflow where the agent can use the GitHub CLI (`gh`) to create a new issue and update the local ticket file accordingly.

### Requirements:

1.  **Use GitHub CLI:** The automation will be built around the `gh issue create` command.

2.  **Separate Title and Body:** When creating the issue, the ticket's title must be passed to the `--title` flag, and the ticket's content (excluding the title) must be passed as the body. This avoids duplicating the title within the GitHub issue body.

3.  **Rename Local File:** After the GitHub issue is successfully created and its ID is retrieved, the local markdown ticket file must be renamed to include the issue number as a prefix. The agreed-upon format is: `gh<ID>-<slugified-title>.md`.

4.  **Update File Content:** The new GitHub issue number and URL must be prepended to the content of the newly renamed local file.

### Prerequisites:

The user's environment must have the GitHub CLI (`gh`) installed and authenticated via `gh auth login`.

## Timeline

- 2025-09-24T09:23:25Z @tobiu assigned to @tobiu
- 2025-09-24T09:23:26Z @tobiu added the `enhancement` label
- 2025-09-24T09:24:01Z @tobiu referenced in commit `0cadcca` - "#7249 internal ticket"
- 2025-10-05T11:36:31Z @ksanjeev284 cross-referenced by #1
### @tobiu - 2025-11-15T09:45:18Z

already resolved.

- 2025-11-15T09:45:18Z @tobiu closed this issue

