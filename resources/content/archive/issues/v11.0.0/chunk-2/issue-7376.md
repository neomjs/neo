---
id: 7376
title: Define Hybrid API vs. Knowledge Base Workflow for Agent
state: CLOSED
labels:
  - documentation
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - kart-u
createdAt: '2025-10-05T13:02:36Z'
updatedAt: '2025-10-24T09:39:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7376'
author: tobiu
commentsCount: 3
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:39:53Z'
---
# Define Hybrid API vs. Knowledge Base Workflow for Agent

The agent will have access to two sources of information for issues and PRs: the real-time GitHub API (via `gh`) and the local, semantic-search-optimized knowledge base. To prevent confusion and ensure optimal performance, the agent needs a clear, documented strategy on when to use each. This ticket is to create that "Discover, then Verify" protocol.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent to use the local knowledge base (`ai:query`) for broad, contextual, or semantic searches (Discovery).
3.  The workflow instructs the agent to use the GitHub CLI (`gh`) to get the real-time status (e.g., open/closed, assignees, labels) of a *specific* issue or PR that it has already discovered (Verification).
4.  The protocol should include a clear example of this two-step "Discover, then Verify" process.

## Timeline

- 2025-10-05T13:02:37Z @tobiu added the `documentation` label
- 2025-10-05T13:02:37Z @tobiu added the `enhancement` label
- 2025-10-05T13:02:37Z @tobiu added parent issue #7364
- 2025-10-05T13:02:38Z @tobiu added the `help wanted` label
- 2025-10-05T13:02:38Z @tobiu added the `good first issue` label
- 2025-10-05T13:02:38Z @tobiu added the `hacktoberfest` label
- 2025-10-05T13:02:38Z @tobiu added the `ai` label
### @kart-u - 2025-10-05T13:11:28Z

hello @tobiu I would like to contribute to this, can you please assign it to me

- 2025-10-05T13:22:18Z @ksanjeev284 cross-referenced by PR #7374
- 2025-10-05T13:28:01Z @tobiu cross-referenced by #7367
- 2025-10-05T14:17:43Z @tobiu assigned to @kart-u
### @tobiu - 2025-10-05T14:17:49Z

sure. Gemini input:

> ✦ This ticket is similar to the other documentation task (ticket-update-agent-ticket-creation-workflow.md).
> 
>   Analysis
> 
>   The task is to write a new strategic protocol in AGENTS.md. It needs to explain the concept of using ai:query for discovery and gh commands (like gh issue view) for verification.
> 
>   A contributor working on this does not need to execute the gh commands themselves. They only need to understand the concept and write it down clearly. The existence of the gh CLI and its public documentation is enough information for them to formulate the workflow.
> 
>   Conclusion
> 
>   Yes, someone can start on this ticket immediately.
> 
>   There are no technical blockers for this task. It is a documentation and workflow definition ticket that can be worked on in parallel with the other implementation tickets.

### @tobiu - 2025-10-24T09:39:41Z

Hi @kart-u,

Thank you for your interest in this ticket during Hacktoberfest.

This ticket was for updating the AGENTS.md file with a new strategic protocol. The project's architecture and the agent's core workflow have evolved significantly since this ticket was created, making this specific protocol obsolete.

We're closing this ticket as it is no longer relevant. The upcoming rewrite of AGENTS.md (covered in #7630) will include a new, more streamlined workflow. Thanks again for your willingness to contribute!

- 2025-10-24T09:39:53Z @tobiu closed this issue

