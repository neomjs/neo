---
id: 9702
title: Implement Neural Link Tactical Skill (Tool Chaining)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T17:23:44Z'
updatedAt: '2026-04-04T17:27:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9702'
author: tobiu
commentsCount: 1
parentIssue: 9672
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T17:27:04Z'
---
# Implement Neural Link Tactical Skill (Tool Chaining)

### Background
The `neural-link` MCP Server exposes 33 raw tools for querying and mutating a running Neo.mjs application. However, without a structured skill, autonomous agents lack the tactical grammar (tool chaining sequences) needed to effectively debug applications, leading to hallucinated component IDs or unsafe hot-patching.

### Goal
Implement a progressive disclosure skill for the Neural Link that teaches agents the explicit strategies necessary to master the UI bridging toolkit.

### Implementation Steps
1. Create `.agent/skills/neural-link/SKILL.md` to establish the behavioral trigger using YAML Frontmatter.
2. Create `.agent/skills/neural-link/references/operational-handbook.md` as the underlying playbook payload.
3. Formulate tactical sequences within the handbook, such as:
   - **Discovery Chains:** Always query IDs before invoking tree inspection.
   - **Data Chains:** Finding Stores before checking records.
   - **Safe Patching Protocols:** Mandating source verification (`get_method_source`) before applying runtime code patches.

*Note: This will be connected to Epic #9672 (Workflow Enablement).*

## Timeline

- 2026-04-04T17:23:46Z @tobiu added the `enhancement` label
- 2026-04-04T17:23:47Z @tobiu added the `ai` label
- 2026-04-04T17:23:51Z @tobiu added parent issue #9672
- 2026-04-04T17:24:00Z @tobiu assigned to @tobiu
- 2026-04-04T17:26:52Z @tobiu referenced in commit `719b4bd` - "docs(ai): create neural link tactical skill with progressive disclosure (#9702)"
### @tobiu - 2026-04-04T17:27:03Z

Neural Link progressive disclosure skill implemented successfully. Replaced explicit tool-guessing with robust Tool Chaining sequences inside the new operational-handbook.md. Also incorporated specific lifecycle recovery rules regarding Session ID invalidation during target app reloads.

- 2026-04-04T17:27:04Z @tobiu closed this issue

