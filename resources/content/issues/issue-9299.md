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
updatedAt: '2026-02-24T19:43:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9299'
author: tobiu
commentsCount: 0
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
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

