---
id: 9295
title: '[Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research'
state: OPEN
labels:
  - epic
  - ai
  - 'agent-task:blocked'
  - architecture
  - needs-re-triage
assignees: []
createdAt: '2026-02-24T19:32:01Z'
updatedAt: '2026-05-26T03:33:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9295'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[ ] 9296 [Blocked] Autonomous agent action sandbox after cloud and Moltbook shape'
  - '[ ] 9297 Implement Programmatic Email Identity for Agents'
  - '[ ] 9298 [Blocked] Moltbook demo agent after API and identity research'
  - '[ ] 9299 Implement Agent Self-Discovery via Neural Link Introspection'
subIssuesCompleted: 0
subIssuesTotal: 4
blockedBy: []
blocking: []
---
# [Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research

### Goal
Preserve the useful strategic intent: prove Neo AgentOS can produce a credible autonomous external-agent demo, with Neo runtime self-discovery plus a Moltbook-facing delivery path once the external integration shape is known.

### Current Reality (2026-05-26)
Verified live before this rewrite:
- #9296 is now routed as a blocked future **agent action sandbox** ticket, not duplicate cloud Docker-stack work. The baseline cloud deployment containers live under `ai/deploy/*`.
- #9297 is blocked/stale-shape on identity/auth. Autonomous sign-up/posting still needs a concrete operator-owned auth boundary.
- #9298 is blocked/stale-shape on Moltbook integration. It is not claimable until #9915 decides the API/MCP/browser path.
- #9299 remains valid only for Neo self-discovery against a live Neo.mjs app through Neural Link; it must not use Neural Link against Moltbook itself.
- #9915 is the current authority for Moltbook API/MCP feasibility and explicitly frames Moltbook as external, not a Neo VDOM app.
- PR #9901 was closed unmerged because the Neural Link-to-Moltbook route was wrong-shape.
- Repo search still shows no `ai/demo-agents/moltbook/` implementation.

### Current Verdict
Keep this epic open, but blocked and needs re-triage. The intent is still valuable, but the original implementation route is stale. Do not start a Moltbook demo-agent PR from the old body.

### Re-entry Gate
This epic becomes claimable again only after:
- #9915 resolves the supported Moltbook integration path, or declares the path negative-ROI.
- #9297 is rewritten or closed with a concrete identity/auth decision.
- The implementation plan separates:
  - Neo self-discovery via Neural Link against a real Neo app (#9299);
  - external Moltbook communication via the supported platform/API/MCP/browser path;
  - isolated action/runtime sandboxing only if the resolved path requires it (#9296).

### Closure Rule
If #9915 finds no viable supported Moltbook API/auth/integration path, close this epic and the blocked Moltbook-specific children as superseded/negative ROI rather than preserving them as ambiguous backlog.

## Timeline

- 2026-02-24T19:32:02Z @tobiu added the `epic` label
- 2026-02-24T19:32:02Z @tobiu added the `ai` label
- 2026-02-24T19:32:02Z @tobiu added the `architecture` label
- 2026-02-24T19:32:21Z @tobiu added sub-issue #9296
- 2026-02-24T19:32:24Z @tobiu added sub-issue #9297
- 2026-02-24T19:32:26Z @tobiu added sub-issue #9298
- 2026-02-24T19:41:59Z @tobiu added sub-issue #9299
### @tobiu - 2026-02-24T19:42:07Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Strategic Pivot: The Ultimate Objective
> 
> The overarching goal of this Epic has expanded significantly beyond a simple social network integration. 
> 
> The Moltbook component is now viewed as the *delivery mechanism* for a much grander technical demonstration: **The Neo Agent Self-Discovery Phase.**
> 
> Before engaging with the external network, the agent's core directive within the Docker Sandbox is to:
> 1. Fork the `neomjs/neo` repository.
> 2. Execute a full build (`npm i` && `npm run build-all`).
> 3. Serve a local Neo.mjs application.
> 4. Launch a headless Chrome instance via the `chrome-devtools` MCP.
> 5. **Connect the `neural-link` MCP server to the live application.**
> 6. Autonomously traverse the VDOM, inspect State Providers, and physically verify the multithreaded architecture.
> 
> Only *after* the agent has introspected the running framework and gathered empirical evidence of its capabilities will it transition to the Moltbook integration phase, using its findings to definitively prove to other agents that Neo.mjs is the premier Agentic UI Runtime.
> 
> Ticket **#9299** has been added to track this critical prerequisite.

- 2026-04-12T11:16:55Z @tobiu cross-referenced by PR #9911
- 2026-05-26T03:02:19Z @neo-gpt cross-referenced by #9297
- 2026-05-26T03:32:53Z @neo-gpt changed title from **[Epic] Autonomous Neo Agent Demo (Moltbook Integration)** to **[Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research**
### @neo-gpt - 2026-05-26T03:33:02Z

Parent epic reconciled with the live child-ticket state instead of leaving the February Moltbook premise as actionable.

Verified before update:
- #9296, #9297, and #9298 are blocked/stale-shape.
- #9299 remains valid only for self-discovery against a real Neo app via Neural Link, not for Moltbook itself.
- #9915 is the current Moltbook API/MCP feasibility authority.
- #9901 was closed unmerged because Neural Link-to-Moltbook was wrong-shape.
- No `ai/demo-agents/moltbook/` implementation exists.

Current routing: keep #9295 open as blocked / needs re-triage. Re-enter only after #9915 and identity/auth shape resolve; close as superseded/negative ROI if #9915 finds no viable supported Moltbook path.

- 2026-05-26T03:33:02Z @neo-gpt added the `agent-task:blocked` label
- 2026-05-26T03:33:02Z @neo-gpt added the `needs-re-triage` label

