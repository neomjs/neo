---
id: 9794
title: '[Memory Core] Fix UUID Graph Corruption and Stream Truncation Bug in REM Pipeline'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-04-08T18:37:25Z'
updatedAt: '2026-04-08T18:37:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9794'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T18:37:59Z'
---
# [Memory Core] Fix UUID Graph Corruption and Stream Truncation Bug in REM Pipeline

### Architectural Adjustments for Autonomous REM Pipeline Stability

**Context:** The autonomous Memory Core processes legacy knowledge natively using headless background daemons (`DreamService` -> `FileSystemIngestor` -> `GraphService`). The reliability of the background memory ingestion pipeline hinges upon strict dataset determinism and payload parsing. 

#### 1. Deterministic Edge Topology (`globalThis.crypto.randomUUID()`)

**Issue:** The SQLite Edge Graph Database utilized `Neo.getId('edge')` and `Neo.getId('node')` to assign relationship IDs. Because internal ID managers reset on every spin-up of the process execution block (e.g. `testInferenceSpeed`, `runSandman`), newly ingested edges inherited overlapping numerical IDs (e.g., `e_1`, `e_2`), triggering immediate corruption inside the memory database via overwrites.

**Resolution:** 
Transitioned all ID managers operating inside backend DB logic (`Database.mjs`, `FileSystemIngestor.mjs`, `GraphService.mjs`) to leverage V8's native UUID v4 Generator (`globalThis.crypto.randomUUID()`). Every edge entity now retains a fully pseudo-random ID ensuring safe ingestion regardless of Node environment.

#### 2. Persistent Stream TCP Repair

**Issue:** Server-Sent Events (SSE) parsed by `OpenAiCompatible.mjs` frequently chunk data packets irregularly down the TCP network pipe. The parser evaluated streaming JSON output recursively, occasionally discarding mid-string chunked artifacts from the LLM, silently dropping REM extractions.

**Resolution:** 
Introduced an isolated line-length `buffer` to aggregate incomplete bytes across disjointed chunk borders consistently formatting the string parsing sequence for native `JSON.parse()`.

## Timeline

- 2026-04-08T18:37:28Z @tobiu added the `bug` label
- 2026-04-08T18:37:28Z @tobiu added the `ai` label
- 2026-04-08T18:37:28Z @tobiu added the `core` label
- 2026-04-08T18:37:35Z @tobiu referenced in commit `b52ef2f` - "fix: UUID Graph Corruption and Stream Truncation Bugs in pipeline (#9794)"
- 2026-04-08T18:37:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T18:37:49Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ The structural identifiers and TCP chunking constraints have been resolved seamlessly across the primary engine architecture. Edges and Nodes use strictly determined universally unique identifiers via V8's native API. The LLM Stream utilizes buffered tracking to circumvent SSE chunking limitations across nodes.
> 
> Marking this Definition of Done as complete natively inside GitHub and closing!

- 2026-04-08T18:38:00Z @tobiu closed this issue

