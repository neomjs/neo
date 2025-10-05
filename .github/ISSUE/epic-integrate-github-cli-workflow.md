# Epic: Integrate GitHub CLI to Streamline Contribution Workflow

GH ticket id: #7364

**Assignee:** tobiu
**Status:** To Do

## Scope

This epic aims to deeply integrate the GitHub CLI (`gh`) into the development and contribution workflow. The goal is to automate the synchronization between local markdown-based tickets and GitHub issues/PRs, reduce manual effort for the project maintainer, and empower the AI agent to participate more fully in the GitHub ecosystem (e.g., reviewing PRs, creating issues).

## Top-Level Items & Implementation Phases

### Phase 1: Foundational CLI Integration & Authentication
- **Goal:** Ensure the agent can securely authenticate with the GitHub API via `gh` and perform basic read-only operations.
- **Sub-Tasks:**
    - `ticket-setup-github-cli-authentication.md`: Document the process for setting up `gh` auth, likely using a `GH_TOKEN`.
    - `ticket-agent-can-list-issues-and-prs.md`: Implement agent capabilities to list open issues and pull requests.

### Phase 2: Automating the Ticket/Issue Workflow
- **Goal:** Eliminate the manual synchronization between local markdown tickets and GitHub issues.
- **Sub-Tasks:**
    - `ticket-create-gh-issue-from-md-ticket.md`: Create a script that uses `gh` to create a new GitHub issue from a local `.github/ISSUE/*.md` file, extracting the title and body.
    - `ticket-sync-gh-issue-id-to-md-ticket.md`: The script from the previous task should automatically edit the local markdown file to insert the newly created GitHub issue URL and ID.
    - `ticket-update-agent-ticket-creation-workflow.md`: Update `AGENTS.md` to instruct the agent to use this new automated workflow instead of prompting the user to do it manually.

### Phase 3: Enabling Agent-led PR Review
- **Goal:** Empower the agent to fetch, review, and comment on pull requests from external contributors.
- **Sub-Tasks:**
    - `ticket-agent-can-checkout-pr-branch.md`: Implement a workflow for the agent to use `gh pr checkout <PR_NUMBER>` to pull down the code from a PR.
    - `ticket-agent-can-diff-a-pr.md`: Use `gh pr diff <PR_NUMBER>` to get a quick overview of changes.
    - `ticket-agent-can-comment-on-pr.md`: Use `gh pr review --comment` or `gh issue comment` to provide feedback on PRs.
    - `ticket-define-pr-review-protocol-for-agent.md`: Create a clear protocol in `AGENTS.md` for how the agent should conduct reviews (e.g., be constructive, focus on coding guidelines, run tests).
