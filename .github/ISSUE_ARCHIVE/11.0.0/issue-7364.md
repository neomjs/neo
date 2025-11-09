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
  - 7365
  - 7366
  - 7367
  - 7368
  - 7369
  - 7370
  - 7371
  - 7372
  - 7373
  - 7376
  - 7377
  - 7378
  - 7381
  - 7391
  - 7393
  - 7414
  - 7418
subIssuesCompleted: 17
subIssuesTotal: 17
closedAt: '2025-10-24T09:47:01Z'
---
# Integrate GitHub CLI to Streamline Contribution Workflow

**Reported by:** @tobiu on 2025-10-05

---

**Sub-Issues:** #7365, #7366, #7367, #7368, #7369, #7370, #7371, #7372, #7373, #7376, #7377, #7378, #7381, #7391, #7393, #7414, #7418
**Progress:** 17/17 completed (100%)

---

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

## Comments

### @tobiu - 2025-10-05 10:34

I think this new epic fits the `hacktoberfest` scope very well: https://github.com/neomjs/neo/issues/7296

These tickets require the "ai native" workflows, so you need to read these 2 first:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Since the epic subs strongly build on and relate to each other, I also strongly recommend to join the Slack and / or Discord Channels, so that you guys can sync. Like a real project :)

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

### @tobiu - 2025-10-24 09:47

closing the epic, new items for the github-workflow mcp server will get added as new tickets / epics.

