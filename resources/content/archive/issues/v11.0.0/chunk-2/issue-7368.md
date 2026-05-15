---
id: 7368
title: Enhance Issue Creation Script to Sync GitHub ID back to Markdown File
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - LemonDrop847
createdAt: '2025-10-05T10:54:07Z'
updatedAt: '2025-10-05T17:49:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7368'
author: tobiu
commentsCount: 3
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-05T17:49:23Z'
---
# Enhance Issue Creation Script to Sync GitHub ID back to Markdown File

After a GitHub issue is created from a local markdown ticket, the new GitHub issue ID and URL need to be written back into the markdown file. This closes the loop and creates a permanent, version-controlled link between the two. This ticket is to enhance the `createGhIssue.mjs` script to perform this write-back operation.

## Acceptance Criteria

1.  The `createGhIssue.mjs` script is modified.
2.  After successfully creating a GitHub issue, the script must capture the new issue's URL from the stdout of the `gh issue create` command.
3.  The script will then read the original markdown ticket file.
4.  It will replace the placeholder `GH ticket id: #<number>` with the new issue URL and ID (e.g., `GH ticket id: #1234` and add the URL on a new line).
5.  This ensures the local ticket is always synchronized with its remote counterpart on GitHub.

## Timeline

- 2025-10-05T10:54:08Z @tobiu added the `enhancement` label
- 2025-10-05T10:54:08Z @tobiu added the `help wanted` label
- 2025-10-05T10:54:08Z @tobiu added the `good first issue` label
- 2025-10-05T10:54:08Z @tobiu added the `hacktoberfest` label
- 2025-10-05T10:54:08Z @tobiu added parent issue #7364
- 2025-10-05T10:54:09Z @tobiu added the `ai` label
### @LemonDrop847 - 2025-10-05T12:08:55Z

Would like to have a go at this as well!

### @LemonDrop847 - 2025-10-05T12:25:09Z

I believe this file isn't yet created maybe dependent on some other issue

- 2025-10-05T13:55:31Z @tobiu assigned to @LemonDrop847
### @tobiu - 2025-10-05T13:55:34Z

sure. assigned.

more input from gemini:

>   Formal Blocker:
>   The task is officially blocked by the Phase 1 ticket: ticket-setup-github-cli-authentication.md. The script's primary function is to communicate with the GitHub API via the gh CLI, which requires an authenticated environment. We haven't yet created the guide that explains how to set this up.
> 
>   Practical Path Forward:
>   The contributor, LemonDrop847, can start working on this immediately if they are comfortable doing the following without waiting for our official guide:
>    1. Independently install the GitHub CLI.
>    2. Independently run gh auth login to authenticate their environment.
> 
>   Recommendation:
>   The ticket is available to be worked on, but it would be helpful to communicate to LemonDrop847 that they will need to set up and authenticate the gh CLI on their own as a first step, since the official project documentation for that process doesn't exist yet.

- 2025-10-05T15:51:44Z @LemonDrop847 cross-referenced by #7377
- 2025-10-05T17:49:24Z @tobiu closed this issue
- 2025-10-05T18:04:09Z @LemonDrop847 referenced in commit `5a7495c` - "Merge pull request #7380 from LemonDrop847/feat/issue-creation-script-sync-ghID-to-MD

feat:issue creation script to Sync GitHub ID back to Markdown File (fixes: #7368)"

