---
id: 9795
title: '[Memory Core] Normalize REM Pipeline Telemetry Log Output'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-04-08T18:44:14Z'
updatedAt: '2026-04-08T18:44:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9795'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T18:44:43Z'
---
# [Memory Core] Normalize REM Pipeline Telemetry Log Output

### REM Pipeline Telemetry Normalization

**Context:** The asynchronous logging routines throughout `DreamService`, `GraphService`, and `FileSystemIngestor` were outputting inconsistent hierarchies during the `Sandman` ingestion loop. Extremely looping execution pathways (like raw AST Node upserts to RAM) were dumping thousands of identical terminal lines at the `[DEBUG]` level identically with high-level structural milestones in the `[INFO]` level.

**Resolution:**
- Silenced the massive iterative debug loop inside `GraphService.upsertNode` that was triggering ~7500 times during FileSystem workspace synchronization.
- Elevated high-level operational execution anchors inside `DreamService` (such as `Extracting Tri-Vector Synthesis`, `Extracting Topological Conflicts`, and `Launching Capability Gap Inference passes`) to `[INFO]` so they provide clear terminal separation during deep REM digestions without needing pure debug stacks enabled.
- Downgraded heavily looping sub-task routines (e.g., dynamically embedding issues individually) to `[DEBUG]`.

## Timeline

- 2026-04-08T18:44:15Z @tobiu added the `enhancement` label
- 2026-04-08T18:44:15Z @tobiu added the `ai` label
- 2026-04-08T18:44:16Z @tobiu added the `core` label
- 2026-04-08T18:44:22Z @tobiu referenced in commit `c1b10aa` - "chore: Normalize REM Pipeline Telemetry Log Output (#9795)"
- 2026-04-08T18:44:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T18:44:35Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Normalized the console output for the background Memory Core pipeline!
> - Lifted major `DreamService` REM milestones to `INFO` logs.
> - Reduced recursive inner sub-tasks (single gap analysis checks, issue embeddings) to `DEBUG` logs.
> - Silenced the 7500x `GraphService.upsertNode` `DEBUG` spam that overwhelmed the console during local workspace indexing.
> 
> Closing ticket natively.

- 2026-04-08T18:44:43Z @tobiu closed this issue

