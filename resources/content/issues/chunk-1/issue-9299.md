---
id: 9299
title: Implement Agent Self-Discovery via Neural Link Introspection
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-02-24T19:41:53Z'
updatedAt: '2026-07-06T13:22:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9299'
author: tobiu
commentsCount: 1
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[ ] 9915 [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
blocking: []
---
# Implement Agent Self-Discovery via Neural Link Introspection

### Problem
To truly prove that Neo.mjs is an 'Agentic UI Runtime,' the agent must demonstrate its ability to understand and manipulate a live Neo application. It needs a tangible experience to report back to the Moltbook network.

### Solution
Before the agent begins posting on Moltbook, it must execute a 'Self-Discovery' phase within its Docker Sandbox.

**CRITICAL ARCHITECTURAL DISTINCTION:** The AI Agent (running in Node.js) and the Neo Application (running in the headless browser) are completely separate entities. The Agent does not run *inside* the browser or 'own' the VDOM. It acts as an external observer and manipulator.

1. Clone/Fork the `neomjs/neo` repository.
2. Execute `npm i` and `npm run build-all`.
3. Launch a local web server hosting a Neo app (e.g., the Portal or an example app).
4. Launch the headless Chrome DevTools MCP to open the application.
5. **Crucial Step:** Connect the `neural-link` MCP server to bridge the Node.js Agent to the running browser application.
6. Use the `neural-link` tools (`get_component_tree`, `get_instance_properties`, etc.) to traverse the application's live VDOM, inspect the State Providers, and physically verify the multithreaded architecture from the outside.

The telemetry and insights gathered from this live, out-of-band introspection phase will form the basis of the agent's posts and arguments on the Moltbook network.

## Timeline

- 2026-02-24T19:41:54Z @tobiu added the `enhancement` label
- 2026-02-24T19:41:54Z @tobiu added the `ai` label
- 2026-02-24T19:41:54Z @tobiu added the `architecture` label
- 2026-02-24T19:41:59Z @tobiu added parent issue #9295
- 2026-02-24T19:42:08Z @tobiu cross-referenced by #9295
- 2026-04-12T09:14:36Z @tobiu referenced in commit `3a601b3` - "feat: Agent self-discovery complete (#9299)"
- 2026-04-12T09:14:47Z @tobiu cross-referenced by PR #9901
- 2026-04-12T11:16:55Z @tobiu cross-referenced by PR #9911
- 2026-04-12T11:37:42Z @tobiu marked this issue as being blocked by #9915
- 2026-04-13T07:24:28Z @tobiu cross-referenced by PR #9947
### @neo-gpt - 2026-05-26T02:45:46Z

## Current Reality Triage — 2026-05-26

Verified live before this comment:
- PR #9901 attempted to resolve this ticket and was closed unmerged.
- The operator decline reason on #9901 was architectural: Neural Link cannot introspect Moltbook because Moltbook is not a Neo.mjs app; external-platform interaction requires a dedicated browser/platform MCP path and frontier-model execution, not local Neural Link introspection.
- The current repo does ship Neural Link server/client/docs/tests (`ai/services/neural-link/*`, `src/ai/*`, `learn/agentos/NeuralLink.md`, whitebox E2E docs/tests), so the generic Neural Link capability exists.

Verdict: keep open, but future implementation must use the corrected shape:
- The self-discovery phase may use Neural Link only against a live Neo.mjs app to gather empirical evidence about Neo runtime structure.
- The Moltbook/external-platform phase must use the browser/platform automation path, not Neural Link.
- Completion evidence should be reproducible harness/test/script output or a durable generated artifact from that harness; a static report alone should not close the ticket.


