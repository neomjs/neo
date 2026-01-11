---
id: 7381
title: Create a Robust GitHub CLI Setup and Verification Script
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - LemonDrop847
createdAt: '2025-10-05T15:57:44Z'
updatedAt: '2025-10-22T22:51:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7381'
author: tobiu
commentsCount: 3
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-13T21:15:31Z'
---
# Create a Robust GitHub CLI Setup and Verification Script

To ensure all contributors have a consistent and functional environment for using our `gh`-based workflows, we need a setup script. This script will verify that the GitHub CLI is installed, authenticated, and up-to-date. This task is based on feedback from an external review which highlighted potential gaps in our contributor setup process.

## Acceptance Criteria

1.  A new build script is created (e.g., `buildScripts/ai/verifyGhSetup.mjs`).
2.  The script must detect the user's OS (macOS, Linux, Windows).
3.  It must check if `gh` is installed and provide OS-specific installation instructions if it is not (including for Windows).
4.  It must run `gh auth status` to verify the user is logged in, and prompt them to run `gh auth login` if they are not.
5.  It must check the `gh --version` against a minimum required version and instruct the user to upgrade if necessary.
6.  The script should be added to `package.json` so it can be run easily (e.g., `npm run ai:verify-gh-setup`).

## Timeline

- 2025-10-05T15:57:45Z @tobiu added the `enhancement` label
- 2025-10-05T15:57:45Z @tobiu added the `help wanted` label
- 2025-10-05T15:57:45Z @tobiu added the `good first issue` label
- 2025-10-05T15:57:45Z @tobiu added the `hacktoberfest` label
- 2025-10-05T15:57:45Z @tobiu added the `ai` label
- 2025-10-05T15:57:45Z @tobiu added parent issue #7364
### @LemonDrop847 - 2025-10-05T16:09:00Z

would like to try this

- 2025-10-05T16:09:32Z @tobiu assigned to @LemonDrop847
### @tobiu - 2025-10-05T16:09:40Z

thx! assigned.

- 2025-10-05T16:34:20Z @LemonDrop847 cross-referenced by PR #7382
### @tobiu - 2025-10-13T21:15:31Z

closing the ticket as resolved.

- 2025-10-13T21:15:31Z @tobiu closed this issue

