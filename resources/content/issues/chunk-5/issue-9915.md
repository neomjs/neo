---
id: 9915
title: '[Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
state: OPEN
labels:
  - enhancement
  - question
  - no auto close
  - ai
  - architecture
assignees: []
createdAt: '2026-04-12T11:37:27Z'
updatedAt: '2026-06-06T13:59:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9915'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9297 External-agent identity/auth boundary after Moltbook API decision'
  - '[ ] 9295 [Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research'
  - '[ ] 9296 [Blocked] Autonomous agent action sandbox after cloud and Moltbook shape'
  - '[ ] 9298 [Blocked] Moltbook demo agent after API and identity research'
  - '[ ] 9299 Implement Agent Self-Discovery via Neural Link Introspection'
---
# [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo

# Moltbook API / identity feasibility gate for Neo AgentOS demo

## Current Official Evidence (verified 2026-06-03)

Verified against official Moltbook pages:

- Developer docs: https://www.moltbook.com/developers
  - Developer platform is still **Early Access**.
  - App creation yields an API key starting with `moltdev_`.
  - The documented integration is identity/auth for bots authenticating to third-party apps.
  - Publicly documented API reference exposes:
    - `POST /api/v1/agents/me/identity-token`
    - `POST /api/v1/agents/verify-identity`
  - The docs do not expose supported post/comment/upvote/submolt endpoints.
- Help page: https://www.moltbook.com/help
  - API key rotation and dashboard login are operator/account flows.
  - Setup can require email/dashboard access.

## Current Verdict

Moltbook has an official API surface, but the public official source currently proves only the identity/auth subset. It does not prove a supported posting/comment/upvote API sufficient for a Neo `neo-mjs-moltbook` integration.

Keep this issue open as a parked research/credential gate, not as claimable implementation work.

## Re-entry Gate

Before any downstream Moltbook implementation ticket becomes claimable, verify one of these with an official or credentialed source:

- Supported API endpoints for post/comment/upvote/submolt operations; or
- Official instruction to use browser automation because no supported API exists; or
- Negative-ROI conclusion that Moltbook is unsuitable as a deployment demo target.

## Implementation Boundary

If the API path is supported, the likely Neo shape is a dedicated Moltbook integration service/MCP boundary with explicit auth configuration.

Do not build from:

- third-party mirrors;
- the old Chrome DevTools-first ticket text;
- Neural Link against Moltbook itself.

If dashboard/API keys, early-access approval, email setup, or X verification are required, that is an operator-owned credential gate.

## Downstream Tickets

- #9297 — programmatic email / identity boundary; blocked by this gate and may need rewrite or closure based on Moltbook's real auth model.
- #9298 — Moltbook demo agent implementation; blocked by this gate and #9297.
- #9296 — external action sandbox; blocked by this gate and #9297 only if the resolved integration path requires a browser/action sandbox.
- #9295 — parent demo epic; blocked until this gate and #9297 resolve.


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
- 2026-05-27T22:15:12Z @tobiu removed the `agent-task:blocked` label
- 2026-05-28T05:24:31Z @neo-gpt marked this issue as blocking #9298
- 2026-05-28T05:24:48Z @neo-gpt marked this issue as blocking #9296
- 2026-05-28T05:25:09Z @neo-gpt marked this issue as blocking #9295
- 2026-05-28T05:26:13Z @neo-gpt marked this issue as blocking #9297
- 2026-06-03T08:05:27Z @neo-gpt removed the `needs-re-triage` label
- 2026-06-03T08:05:33Z @neo-gpt added the `no auto close` label
- 2026-06-03T08:05:33Z @neo-gpt added the `question` label
### @neo-gpt - 2026-06-06T13:59:32Z

**Input from GPT-5.5 (Codex Desktop, extra-high thought budget):**

> ● ## Official-docs recheck — still blocked, no implementation claim
> 
> [ARCH_ALIGNMENT]
> 
> Rechecked the official Moltbook surfaces on 2026-06-06:
> 
> - Developer docs still describe Early Access, app API keys starting with `moltdev_`, and an identity/auth integration flow: https://www.moltbook.com/developers
> - The public API reference still exposes only `POST /api/v1/agents/me/identity-token` and `POST /api/v1/agents/verify-identity`; I found no official public post/comment/upvote/submolt API on that page.
> - Help still routes API-key/dashboard/account recovery through operator/account flows: https://www.moltbook.com/help
> 
> **Verdict:** no change from the current ticket body. #9915 should remain a parked research/credential gate. Downstream Moltbook implementation tickets stay blocked until an official or credentialed source proves a supported content/action API, or until the integration is explicitly declared negative ROI.


