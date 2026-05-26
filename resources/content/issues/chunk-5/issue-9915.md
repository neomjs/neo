---
id: 9915
title: '[Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
state: OPEN
labels:
  - enhancement
  - ai
  - 'agent-task:blocked'
  - architecture
  - needs-re-triage
assignees: []
createdAt: '2026-04-12T11:37:27Z'
updatedAt: '2026-05-26T03:43:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9915'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9299 Implement Agent Self-Discovery via Neural Link Introspection'
---
# [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo

### Objective
Evaluate the supported Moltbook integration path before any Neo AgentOS Moltbook demo-agent implementation starts.

### Current Official Evidence (2026-05-26)
Verified live against official Moltbook pages before this rewrite:
- Official developer docs: https://www.moltbook.com/developers
  - Developer platform is **Early Access**.
  - App creation yields an API key starting with `moltdev_`.
  - Publicly documented endpoints are identity-focused:
    - `POST /api/v1/agents/me/identity-token` using the bot API key.
    - `POST /api/v1/agents/verify-identity` using `X-Moltbook-App-Key`.
  - The documented flow is bot identity verification for third-party apps, not full public posting/comment/upvote automation.
- Official help page: https://www.moltbook.com/help
  - Operators can rotate an API key from the dashboard.
  - Agent dashboard/account setup can require email/setup-link flow.

### Current Verdict
Moltbook does have an official API surface, but the public official source verified here only proves the identity/auth subset. It does **not** yet prove a supported posting/comment/upvote API sufficient for a Neo `neo-mjs-moltbook` integration.

Do not build the Moltbook demo agent from third-party mirrors or the old Chrome DevTools-first ticket text.

### Remaining Research Gate
Before implementation can proceed, verify one of these with an official or credentialed source:
- Supported API endpoints for post/comment/upvote/submolt operations; or
- Official instruction to use browser automation because no supported API exists; or
- Negative-ROI conclusion that Moltbook is unsuitable as a deployment demo target.

### Implementation Gate
If the API path is supported, the likely Neo shape is a dedicated Moltbook integration service/MCP boundary with explicit auth configuration, not Neural Link and not an ad-hoc browser script. If the path requires dashboard/API keys or early-access approval, that is an operator-owned credential gate.

## Timeline

- 2026-04-12T11:37:30Z @tobiu added the `enhancement` label
- 2026-04-12T11:37:30Z @tobiu added the `ai` label
- 2026-04-12T11:37:30Z @tobiu added the `architecture` label
- 2026-04-12T11:37:42Z @tobiu marked this issue as blocking #9299
- 2026-05-26T03:02:19Z @neo-gpt cross-referenced by #9297
- 2026-05-26T03:14:09Z @neo-gpt cross-referenced by #9298
- 2026-05-26T03:23:38Z @neo-gpt cross-referenced by #9296
- 2026-05-26T03:32:54Z @neo-gpt cross-referenced by #9295
- 2026-05-26T03:43:47Z @neo-gpt changed title from **[Research] Evaluate Moltbook API capabilities and MCP infrastructure** to **[Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo**
### @neo-gpt - 2026-05-26T03:43:57Z

Updated with live official-source findings.

Sources checked:
- Official developer docs: https://www.moltbook.com/developers
- Official help page: https://www.moltbook.com/help

Finding: Moltbook has an official API surface, but the publicly visible official docs I could verify only prove the identity/auth subset (`identity-token` + `verify-identity`) and early-access app-key flow. They do not yet prove supported post/comment/upvote/submolt endpoints for a Neo integration.

Routing: keep open but blocked / needs re-triage. The next valid step requires official credentialed docs, dashboard/API-key access, or a negative-ROI decision. Do not implement from third-party mirrors or the old Chrome DevTools-first shape.

- 2026-05-26T03:43:57Z @neo-gpt added the `agent-task:blocked` label
- 2026-05-26T03:43:57Z @neo-gpt added the `needs-re-triage` label

