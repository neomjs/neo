---
id: 7364
title: Integrate GitHub CLI to Streamline Contribution Workflow
state: CLOSED
labels:
  - help wanted
  - good first issue
  - epic
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-05T10:23:45Z'
updatedAt: '2025-10-24T09:47:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7364'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 7365 Document and Configure GitHub CLI Authentication'
  - '[x] 7366 Enable Agent to List GitHub Issues and PRs'
  - '[x] 7367 Create Script to Automate GitHub Issue Creation from Markdown Ticket'
  - '[x] 7368 Enhance Issue Creation Script to Sync GitHub ID back to Markdown File'
  - '[x] 7369 Update Agent Workflow to use Automated GitHub Issue Creation'
  - '[x] 7370 Enable Agent to Checkout PR Branches'
  - '[x] 7371 Enable Agent to Diff a Pull Request'
  - '[x] 7372 Enable Agent to Comment on Pull Requests'
  - '[x] 7373 Define a Clear Pull Request Review Protocol for the Agent'
  - '[x] 7376 Define Hybrid API vs. Knowledge Base Workflow for Agent'
  - '[x] 7377 Create Script to Sync New GitHub Issues to Local Markdown Files'
  - '[x] 7378 Enhance Knowledge Base to Include GitHub Comments'
  - '[x] 7381 Create a Robust GitHub CLI Setup and Verification Script'
  - '[x] 7391 Refactor createGhIssue.mjs to use fs-extra for consistency'
  - '[x] 7393 Move PR workflows to separate guide in learn/guides/ai'
  - '[x] 7414 Implement GitHub Action to Prevent Issue Reopening'
  - '[x] 7418 Refine and Integrate GitHub CLI Guide'
subIssuesCompleted: 17
subIssuesTotal: 17
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:47:01Z'
---
# Integrate GitHub CLI to Streamline Contribution Workflow

This epic aims to deeply integrate the GitHub CLI (`gh`) into the development and contribution workflow. The goal is to automate the synchronization between local markdown-based tickets and GitHub issues/PRs, reduce manual effort for the project maintainer, and empower the AI agent to participate more fully in the GitHub ecosystem (e.g., reviewing PRs, creating issues).

## Top-Level Items & Implementation Phases

### Phase 1: Foundational CLI Integration & Authentication
- **Goal:** Ensure the agent can securely authenticate with the GitHub API via `gh` and perform basic read-only operations.
- **Sub-Tasks:**
    - `ticket-create-robust-gh-setup-script.md`: Create a robust script to verify `gh` installation, authentication, and version.
    - `ticket-setup-github-cli-authentication.md`: Document the process for setting up `gh` auth, likely using a `GH_TOKEN`.
    - `ticket-refine-github-cli-guide.md`: Refine and integrate the GitHub CLI authentication guide.
    - `ticket-agent-can-list-issues-and-prs.md`: Implement agent capabilities to list open issues and pull requests.

### Phase 2: Automating the Ticket/Issue Workflow
- **Goal:** Eliminate the manual synchronization between local markdown tickets and GitHub issues.
- **Sub-Tasks:**
    - `ticket-create-gh-issue-from-md-ticket.md`: Create a script that uses `gh` to create a new GitHub issue from a local `.github/ISSUE/*.md` file, extracting the title and body.
    - `ticket-refactor-create-gh-issue-to-use-fs-extra.md`: Refactor `createGhIssue.mjs` to use `fs-extra` for consistency.
    - `ticket-sync-gh-issue-id-to-md-ticket.md`: The script from the previous task should automatically edit the local markdown file to insert the newly created GitHub issue URL and ID.
    - `ticket-update-agent-ticket-creation-workflow.md`: Update `AGENTS.md` to instruct the agent to use this new automated workflow instead of prompting the user to do it manually.
    - `ticket-implement-gh-action-prevent-reopen.md`: Implement a GitHub Action to automatically close reopened issues and create new ones.

### Phase 3: Enabling Agent-led PR Review
- **Goal:** Empower the agent to fetch, review, and comment on pull requests from external contributors.
- **Sub-Tasks:**
    - `ticket-agent-can-checkout-pr-branch.md`: Implement a workflow for the agent to use `gh pr checkout <PR_NUMBER>` to pull down the code from a PR.
    - `ticket-agent-can-diff-a-pr.md`: Use `gh pr diff <PR_NUMBER>` to get a quick overview of changes.
    - `ticket-agent-can-comment-on-pr.md`: Use `gh pr review --comment` or `gh issue comment` to provide feedback on PRs.
    - `ticket-define-pr-review-protocol-for-agent.md`: Create a clear protocol in `AGENTS.md` for how the agent should conduct reviews (e.g., be constructive, focus on coding guidelines, run tests).

### Phase 4: Advanced Integration & Data Enrichment
- **Goal:** Enhance the agent's contextual understanding by enriching the knowledge base and refining its data access strategies.
- **Sub-Tasks:**
    - `ticket-define-hybrid-api-vs-kb-workflow.md`: Formally document the hybrid strategy for using the GitHub API for real-time status and the local knowledge base for deep context.
    - `ticket-sync-gh-issues-to-local.md`: Create a script to sync new GitHub issues to local markdown files.
    - `ticket-add-github-comments-to-kb.md`: Enhance the knowledge base to include comments from GitHub issues and PRs.

## Timeline

- 2025-10-05T10:23:45Z @tobiu assigned to @tobiu
- 2025-10-05T10:23:46Z @tobiu added the `help wanted` label
- 2025-10-05T10:23:46Z @tobiu added the `good first issue` label
- 2025-10-05T10:23:47Z @tobiu added the `epic` label
- 2025-10-05T10:23:47Z @tobiu added the `hacktoberfest` label
- 2025-10-05T10:23:47Z @tobiu added the `ai` label
- 2025-10-05T10:32:12Z @tobiu added sub-issue #7365
### @tobiu - 2025-10-05T10:34:19Z

I think this new epic fits the `hacktoberfest` scope very well: https://github.com/neomjs/neo/issues/7296

These tickets require the "ai native" workflows, so you need to read these 2 first:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Since the epic subs strongly build on and relate to each other, I also strongly recommend to join the Slack and / or Discord Channels, so that you guys can sync. Like a real project :)

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

- 2025-10-05T10:37:16Z @tobiu added sub-issue #7366
- 2025-10-05T10:39:41Z @tobiu added sub-issue #7367
- 2025-10-05T10:54:08Z @tobiu added sub-issue #7368
- 2025-10-05T11:00:51Z @tobiu added sub-issue #7369
- 2025-10-05T11:15:34Z @tobiu added sub-issue #7370
- 2025-10-05T11:22:26Z @tobiu added sub-issue #7371
- 2025-10-05T11:24:47Z @tobiu added sub-issue #7372
- 2025-10-05T11:33:22Z @tobiu added sub-issue #7373
- 2025-10-05T11:37:06Z @tobiu referenced in commit `c99360a` - "#7364 initial tickets as md files"
- 2025-10-05T13:02:37Z @tobiu added sub-issue #7376
- 2025-10-05T13:10:01Z @tobiu added sub-issue #7377
- 2025-10-05T13:11:44Z @tobiu added sub-issue #7378
- 2025-10-05T13:13:13Z @tobiu referenced in commit `9d09963` - "#7364 phase 4 subs as md files"
- 2025-10-05T15:04:31Z @tobiu referenced in commit `0531f7b` - "#7364 internal ticket md file updates"
- 2025-10-05T15:57:45Z @tobiu added sub-issue #7381
- 2025-10-05T15:59:15Z @tobiu referenced in commit `348d2ad` - "#7364 added a new sub-ticket"
- 2025-10-06T11:18:36Z @tobiu added sub-issue #7391
- 2025-10-06T11:20:33Z @tobiu referenced in commit `91af8fb` - "#7364 ticket md files"
- 2025-10-06T12:19:38Z @tobiu added sub-issue #7393
- 2025-10-06T12:19:58Z @tobiu cross-referenced by #7393
- 2025-10-07T15:43:04Z @tobiu added sub-issue #7414
- 2025-10-08T14:16:36Z @tobiu added sub-issue #7418
- 2025-10-14T08:37:50Z @tobiu cross-referenced by #7477
### @tobiu - 2025-10-24T09:47:01Z

closing the epic, new items for the github-workflow mcp server will get added as new tickets / epics.

- 2025-10-24T09:47:01Z @tobiu closed this issue

