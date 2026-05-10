---
id: 9766
title: 'Implement complete openAiCompatible provider architecture (Settings, Docs, Embeddings)'
state: CLOSED
labels:
  - enhancement
  - ai
  - 'agent-role:dev'
assignees:
  - tobiu
createdAt: '2026-04-07T20:25:12Z'
updatedAt: '2026-04-07T20:29:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9766'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T20:26:04Z'
---
# Implement complete openAiCompatible provider architecture (Settings, Docs, Embeddings)

The `openAiCompatible` engine must be formally documented and structurally supported across the entire stack, including semantic vector embeddings.

**Scope:**
1. Update `config.mjs` and `config.template.mjs` to add clear definitions for supported provider strings without breaking JSDoc parsing (`@type {String}` with a manual enumeration comment).
2. Append `apiKey` to the `openAiCompatible` config map, gated firmly with a security warning to only use `.env` injections.
3. Update `.github/AI_QUICK_START.md` to advertise the MLX / MLX-Server mappings alongside Ollama.
4. Refactor `ai/mcp/server/memory-core/services/TextEmbeddingService.mjs` to securely dispatch POST requests to `v1/embeddings` using optional chaining and ES6 syntax standards organically.

## Timeline

- 2026-04-07T20:25:14Z @tobiu added the `enhancement` label
- 2026-04-07T20:25:14Z @tobiu added the `ai` label
- 2026-04-07T20:25:14Z @tobiu added the `agent-role:dev` label
- 2026-04-07T20:25:40Z @tobiu referenced in commit `30fb596` - "feat(ai): Implement complete openAiCompatible provider architecture (#9766)

- Refactored TextEmbeddingService.mjs to support native /v1/embeddings targeting MLX endpoints using ES6 optional chaining
- Documented openAiCompatible architecture universally inside JSDocs and configurations
- Safely added apiKey endpoint mapping via standard dot-env security practices
- Finalized MLX/OpenAI compatibility inside AI quick start documentation"
### @tobiu - 2026-04-07T20:26:01Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Integration completed. Refactored config types, updated AI_QUICK_START syntax mappings, and structurally integrated MLX v1/embeddings mapping using standard ES6 mechanisms. Successfully pushed to local and remote origin.

- 2026-04-07T20:26:04Z @tobiu closed this issue
- 2026-04-07T20:29:17Z @tobiu assigned to @tobiu

