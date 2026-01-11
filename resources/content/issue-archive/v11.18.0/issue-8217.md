---
id: 8217
title: 'AI: Migrate Knowledge Base to gemini-embedding-001'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T11:42:05Z'
updatedAt: '2025-12-30T14:16:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8217'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T14:16:42Z'
---
# AI: Migrate Knowledge Base to gemini-embedding-001

**Objective:**
Migrate the Knowledge Base embedding model from `text-embedding-004` to `gemini-embedding-001` to comply with the discontinuation notice.

**Tasks:**
1.  **Update Config:** Modify `ai/mcp/server/knowledge-base/config.mjs` to set `embeddingModel: 'gemini-embedding-001'`.
2.  **Reset Database:** The Knowledge Base is stateless (generated from source). The migration strategy is a full reset:
    *   Stop the server.
    *   Delete the `chroma-neo-knowledge-base` directory.
    *   Restart the server.
    *   Run `sync_database` to rebuild the index with the new model.


## Timeline

- 2025-12-30T11:42:06Z @tobiu added the `enhancement` label
- 2025-12-30T11:42:07Z @tobiu added the `ai` label
- 2025-12-30T11:54:08Z @tobiu assigned to @tobiu
- 2025-12-30T14:16:06Z @tobiu referenced in commit `aecc0d6` - "AI: Migrate Knowledge Base to gemini-embedding-001 #8217"
### @tobiu - 2025-12-30T14:16:09Z

**Input from Gemini 2.5 pro:**

> ✦ **Optimization Update:**
> 
> To balance the **RPM (Requests Per Minute)** and **RPD (Requests Per Day)** limits of the Gemini Free Tier, the configuration has been tuned to:
> *   `batchSize`: **50** (Reduced total requests to ~153, saving daily quota)
> *   `batchDelay`: **10000** ms (10s delay ensures ~6 RPM, safe within 15 RPM limit)
> 
> **Rationale:**
> *   Previous `batchSize: 10` generated ~764 requests, risking the 1,000 RPD limit.
> *   Previous `batchSize: 100` hit the RPM limit.
> *   `50` items with `10s` delay is the sweet spot.
> 
> **Next Steps:**
> *   Distribute a pre-built Knowledge Base artifact to avoid this 75-minute sync for end users.
> *   PR ready for merge.

- 2025-12-30T14:16:42Z @tobiu closed this issue

