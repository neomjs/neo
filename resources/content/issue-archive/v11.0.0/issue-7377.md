---
id: 7377
title: Create Script to Sync New GitHub Issues to Local Markdown Files
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - nabeel001
createdAt: '2025-10-05T13:10:00Z'
updatedAt: '2025-10-09T18:42:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7377'
author: tobiu
commentsCount: 5
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-09T18:42:49Z'
---
# Create Script to Sync New GitHub Issues to Local Markdown Files

While our primary workflow will be local-first, any contributor can still create an issue directly on GitHub. To ensure our local `.github/ISSUE/` directory remains a comprehensive source of truth, we need a script to find any GitHub issues that are missing a corresponding local markdown file and create one for them. This script will be run periodically to keep the two systems in sync.

**To ensure consistency, this script should reuse the file-writing and formatting logic from the existing `buildScripts/ai/createGhIssue.mjs` script. This will likely require refactoring shared utility functions into a common module.**

## Acceptance Criteria

1.  Helper functions from `createGhIssue.mjs` (such as for filename generation and metadata prepending) are refactored into a shared utility module (e.g., `buildScripts/ai/util/ticketUtils.mjs`).
2.  Create a new build script (`buildScripts/ai/syncGhIssuesToLocal.mjs`).
3.  The script should use `gh issue list` to get a list of all non-closed issues.
4.  It should also get a list of all local ticket files (e.g., by globbing `.github/ISSUE/*.md` and parsing the `GH ticket id` from each).
5.  By comparing the two lists, it should identify any GitHub issues that do not have a corresponding local file.
6.  For each missing one, it should use `gh issue view <ID>` to get the title and body.
7.  It will then create a new local markdown file (e.g., `.github/ISSUE/gh-<ID>-<title>.md`) using the refactored utility functions to ensure consistent formatting.

## Timeline

- 2025-10-05T13:10:01Z @tobiu added the `enhancement` label
- 2025-10-05T13:10:01Z @tobiu added the `help wanted` label
- 2025-10-05T13:10:01Z @tobiu added parent issue #7364
- 2025-10-05T13:10:01Z @tobiu added the `good first issue` label
- 2025-10-05T13:10:01Z @tobiu added the `hacktoberfest` label
- 2025-10-05T13:10:02Z @tobiu added the `ai` label
### @nabeel001 - 2025-10-05T13:15:39Z

Hi @tobiu 
I would like to contribute to this issue. Kindly assign this to me

### @tobiu - 2025-10-05T13:48:49Z

Hi, and thanks for your interest.

These tickets require the "ai native" workflows, so you need to read these 2 first:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Since the epic subs strongly build on and relate to each other, I also strongly recommend to join the Slack and / or Discord Channels, so that you guys can sync. Like a real project :)

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

More Input from Gemini:

> ✦ That's a good question. Let's analyze the dependencies for the modified ticket, ticket-sync-gh-issues-to-local.md.
> 
>   A contributor working on this ticket would need to perform these main tasks:
>    1. Refactor the existing createGhIssue.mjs script to extract utility functions.
>    2. Use the gh issue list command to fetch all remote issues.
>    3. Use the gh issue view command to get the content of specific issues.
>    4. Write new local markdown files using the refactored utility functions.
> 
>   Blocker Analysis
> 
>   The situation is identical to the PR we just reviewed:
> 
>    1. Code Dependency: There are no code blockers. The createGhIssue.mjs script that needs to be refactored is already merged into the repository.
> 
>    2. Environment Dependency: The script's core functionality relies entirely on making authenticated calls to the GitHub API via the gh CLI. This means the developer's environment must be authenticated.
> 
>   The task of documenting how to set up this authentication is ticket-setup-github-cli-authentication.md, which is a Phase 1 ticket and is not yet complete.
> 
>   Conclusion
> 
>    - Formally, yes, it is blocked. According to the phases we've defined, the authentication setup guide is a prerequisite. We cannot require someone to work on this task without having provided them with the instructions on how to set up their environment.
> 
>    - Practically, it is available for a proactive contributor. Just like the contributor who submitted the first PR, a new contributor could decide to install and authenticate the GitHub CLI on their own without waiting for our guide.
> 
>   Recommendation:
>   We can leave the ticket as is. It's ready for an enterprising contributor who is comfortable with the GitHub CLI, but we should not expect the work to begin until the Phase 1 authentication ticket is complete.

- 2025-10-05T13:48:58Z @tobiu assigned to @nabeel001
### @LemonDrop847 - 2025-10-05T15:51:44Z

hey @tobiu i believe this is almost exactly the same as #7368 or are there some other goals with this?

### @tobiu - 2025-10-05T16:02:44Z

there is a similarity, but a different use case: we will need the create script, when contributors use agents to create new tickets. however, "normal users" can create tickets directly on GitHub. E.g., if they discover a bug inside the neo website or examples. so we will frequently need to sync GH issues back into our internal md files.

the benefit of the md files: we drop them into chromaDB (the ai knowledge base), so gemini can use it to query for tickets based on vector distances more easily.

- 2025-10-09T05:06:34Z @nabeel001 cross-referenced by PR #7424
### @nabeel001 - 2025-10-09T05:07:26Z

Hi @tobiu 
I have created the script to sync new gitHub issues to local markdown files. Kindly verify and merge the PR.

- 2025-10-09T18:42:49Z @tobiu closed this issue

