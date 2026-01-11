---
id: 7367
title: Create Script to Automate GitHub Issue Creation from Markdown Ticket
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - ksanjeev284
createdAt: '2025-10-05T10:39:39Z'
updatedAt: '2025-10-05T13:28:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7367'
author: tobiu
commentsCount: 4
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-05T13:28:00Z'
---
# Create Script to Automate GitHub Issue Creation from Markdown Ticket

The current workflow requires the project maintainer to manually create a GitHub issue after a markdown ticket file has been created. This is a tedious and error-prone step that can be fully automated. This ticket is to create a script that uses the GitHub CLI (`gh`) to read a local ticket file and create a corresponding GitHub issue.

## Acceptance Criteria

1.  Create a new build script (e.g., `buildScripts/ai/createGhIssue.mjs`).
2.  The script must accept the file path to a markdown ticket as an argument.
3.  It should parse the markdown file to extract the `title` from the frontmatter for the GitHub issue title.
4.  It should use the rest of the markdown file's content (excluding frontmatter) as the body for the GitHub issue.
5.  The script will use `gh issue create --title "<title>" --body-file <file>` to create the issue. A temporary file might be needed for the body.
6.  The script should be added to `package.json` as `npm run ai:create-gh-issue`.

## Timeline

- 2025-10-05T10:39:41Z @tobiu added the `enhancement` label
- 2025-10-05T10:39:41Z @tobiu added the `help wanted` label
- 2025-10-05T10:39:41Z @tobiu added parent issue #7364
- 2025-10-05T10:39:41Z @tobiu added the `good first issue` label
- 2025-10-05T10:39:42Z @tobiu added the `hacktoberfest` label
- 2025-10-05T10:39:42Z @tobiu added the `ai` label
### @ksanjeev284 - 2025-10-05T10:43:26Z

can you assign me

### @tobiu - 2025-10-05T10:48:17Z

Hi, and thanks for your interest.

These tickets require the "ai native" workflows, so you need to read these 2 first:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Since the epic subs strongly build on and relate to each other, I also strongly recommend to join the Slack and / or Discord Channels, so that you guys can sync. Like a real project :)

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

- 2025-10-05T10:48:22Z @tobiu assigned to @ksanjeev284
### @ksanjeev284 - 2025-10-05T10:50:00Z

Hi @tobiu sure I have joiuned the channel and will start working on it

### @tobiu - 2025-10-05T13:28:00Z

ha, just noticed that the PR mentioned #7376 instead of #7367 (this one). almost closed the wrong ticket^^

thx again for the contribution! closing this one as resolved.

- 2025-10-05T13:28:00Z @tobiu closed this issue

