---
id: 9726
title: Architectural Consolidation of AI Database Paths
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T22:21:39Z'
updatedAt: '2026-04-06T01:50:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9726'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T22:23:43Z'
---
# Architectural Consolidation of AI Database Paths

The current local AI database persistence layer has devolved into a scattered set of top-level directories (`chroma-neo-knowledge-base`, `chroma-neo-memory-core`, `neo-memory-core-sqlite`). 

Because these databases often store highly dense binary chunks, placing them in locations targeted by agent workspace parsers creates a high risk of context bloat and catastrophic loops.

**Tasks:**
1. Isolate all physical database storage into a single cleanly-scoped `.neo-ai-data/` root directory to protect against indexing algorithms parsing gigabytes of binary data.
2. Structure the database types horizontally: `.neo-ai-data/chroma/`, `.neo-ai-data/neo-sqlite/`, and `.neo-ai-data/backups/`.
3. Update `.gitignore` to use this single folder definition rather than ad-hoc rules.
4. Refactor the `syncMemoryChromaToNeo` script to fully utilize the `commander` pattern, supporting `--target-provider` dynamically rather than hardcoding.

## Timeline

- 2026-04-05T22:21:40Z @tobiu added the `enhancement` label
- 2026-04-05T22:21:40Z @tobiu added the `ai` label
### @tobiu - 2026-04-05T22:23:42Z

Architecture consolidation complete and pushed.

- 2026-04-05T22:23:42Z @tobiu referenced in commit `c01e0b7` - "refactor: consolidate AI databases into isolated .neo-ai-data topology (#9726)"
- 2026-04-05T22:23:43Z @tobiu closed this issue
- 2026-04-05T22:35:28Z @tobiu referenced in commit `ab21627` - "test: ensure chroma memory retrieval handles zeroes and skips safely on fresh clones (#9726)"
- 2026-04-05T22:58:30Z @tobiu referenced in commit `a105a5c` - "feat: implement flat JSONL backup topology and generic multi-source JSONL import parsing in DatabaseService (#9726)

- Refactored SQLiteVectorManager to explicitly hydrate float32 array embeddings on getter requests to prevent silent data-loss during JSONL backup generation.
- Decoupled backup destinations from engine-specific namespaces, centralizing JSONL artifacts in .neo-ai-data/backups for engine-agnostic persistence sharing.
- Upgraded manageDatabaseBackup import action to automatically sweep .neo-ai-data/backups and legacy dist/memory-backups, seamlessly grabbing and merging all found JSONL files into the active engine if no specific target file is provided."
- 2026-04-06T01:50:38Z @tobiu assigned to @tobiu

