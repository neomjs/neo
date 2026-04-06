---
id: 9741
title: 'Feature: DreamService Codebase Gap Analysis (Automated Doc Alerting)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T18:15:59Z'
updatedAt: '2026-04-06T18:46:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9741'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T18:46:09Z'
---
# Feature: DreamService Codebase Gap Analysis (Automated Doc Alerting)

### Description
Currently, the SQLite **Hebbian Memory Integration (Hybrid GraphRAG)** pipeline digests episodic memories (conversational sessions) and extracts topological conflicts based on past agent dialogue.

However, the active source code, tests, and guides are sitting in a secondary dimension. If agents build massive structural features over several sessions, the `Memory Core` knows about it contextually. But if the team forgets to document it, the system doesn't natively detect that the resulting artifacts (source code or markdown in `learn/guides/`) are missing.

### Objective
We need to enhance `runSandman.mjs` (the REM Extraction pipeline) to:
1. **Correlate with Knowledge Base JSONL**: Have the `MemoryService` cross-reference active `.neo-ai-data/neo.db` nodes against the embedded knowledge base (the JSONL chunk output of current repository state).
2. **Gap Detection**: Ask `gemma4` to analyze if high-density episodic achievements lack corresponding markdown/source nodes in the core knowledge base.
3. **Actionable Outputs**: If a guide or test is missing, inject a highly weighted "Documentation Gap" or "Test Gap" alert directly into `sandman_handoff.md`.

## Timeline

- 2026-04-06T18:16:04Z @tobiu added the `enhancement` label
- 2026-04-06T18:16:04Z @tobiu added the `ai` label
- 2026-04-06T18:22:53Z @tobiu assigned to @tobiu
- 2026-04-06T18:45:38Z @tobiu referenced in commit `5a573af` - "feat: Implement FileSystem topological ingestion and capability gap analysis inference (#9741)"
### @tobiu - 2026-04-06T18:46:07Z

I have implemented the FileSystemIngestor utilizing the codebase gap analysis logic to inject documentation and test alerts correctly. The failing unit tests preventing deployment have been fixed (GraphService properties payload mapping normalized natively). The REM pipeline logic should now activate securely.

- 2026-04-06T18:46:09Z @tobiu closed this issue

