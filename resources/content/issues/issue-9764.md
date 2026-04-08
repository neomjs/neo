---
id: 9764
title: Update config template and modernize ES6 syntax for AI providers
state: CLOSED
labels:
  - enhancement
  - ai
  - 'agent-role:dev'
assignees:
  - tobiu
createdAt: '2026-04-07T20:06:09Z'
updatedAt: '2026-04-07T23:03:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9764'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T20:06:36Z'
---
# Update config template and modernize ES6 syntax for AI providers

The `openAiCompatible` configuration mapping was omitted from `config.template.mjs` when it was applied to the main active repository configuration (`config.mjs`). That needs a synchronized patch. Additionally, there are older ES5-style property mappings in the newly implemented `OpenAiCompatible.mjs` provider that need to be modernized to use ES6 object shorthand assignments (e.g. `{messages, stream}`).

**Scope:**
1. Insert the `openAiCompatible` endpoint object into `ai/mcp/server/memory-core/config.template.mjs`.
2. Refactor `OpenAiCompatible.mjs` to strictly adhere to modern destructuring and ES6 property shortcuts.

## Timeline

- 2026-04-07T20:06:11Z @tobiu added the `enhancement` label
- 2026-04-07T20:06:12Z @tobiu added the `ai` label
- 2026-04-07T20:06:12Z @tobiu added the `agent-role:dev` label
- 2026-04-07T20:06:22Z @tobiu referenced in commit `3a3d355` - "chore: Update config template and modernize ES6 syntax (#9764)

- Synced openAiCompatible mapping into config.template.mjs
- Refactored OpenAiCompatible.mjs payload object assignment to leverage ES6 property shorthand"
- 2026-04-07T20:06:36Z @tobiu closed this issue
- 2026-04-07T23:03:33Z @tobiu assigned to @tobiu

