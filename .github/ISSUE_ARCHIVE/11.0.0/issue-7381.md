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
closedAt: '2025-10-13T21:15:31Z'
---
# Create a Robust GitHub CLI Setup and Verification Script

**Reported by:** @tobiu on 2025-10-05

---

**Parent Issue:** #7364 - Integrate GitHub CLI to Streamline Contribution Workflow

---

To ensure all contributors have a consistent and functional environment for using our `gh`-based workflows, we need a setup script. This script will verify that the GitHub CLI is installed, authenticated, and up-to-date. This task is based on feedback from an external review which highlighted potential gaps in our contributor setup process.

## Acceptance Criteria

1.  A new build script is created (e.g., `buildScripts/ai/verifyGhSetup.mjs`).
2.  The script must detect the user's OS (macOS, Linux, Windows).
3.  It must check if `gh` is installed and provide OS-specific installation instructions if it is not (including for Windows).
4.  It must run `gh auth status` to verify the user is logged in, and prompt them to run `gh auth login` if they are not.
5.  It must check the `gh --version` against a minimum required version and instruct the user to upgrade if necessary.
6.  The script should be added to `package.json` so it can be run easily (e.g., `npm run ai:verify-gh-setup`).

## Comments

### @LemonDrop847 - 2025-10-05 16:09

would like to try this

### @tobiu - 2025-10-05 16:09

thx! assigned.

### @tobiu - 2025-10-13 21:15

closing the ticket as resolved.

