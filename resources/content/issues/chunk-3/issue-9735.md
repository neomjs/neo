---
id: 9735
title: 'AI Infrastructure: Update Artifact Pipelines to use .neo-ai-data'
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2026-04-06T16:07:37Z'
updatedAt: '2026-04-06T16:11:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9735'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T16:11:10Z'
---
# AI Infrastructure: Update Artifact Pipelines to use .neo-ai-data

### Description
The AI toolchain recently migrated its unified storage state to the hidden `.neo-ai-data` folder, encapsulating both Chroma DB collections and the new SQLite Memory Graph. However, the CI/CD artifact pipeline scripts and onboarding documentation were not updated, leading to missing artifact generation and broken download validations.

### Proposed Changes
1. **`buildScripts/ai/uploadKnowledgeBase.mjs`**: Re-target the zip process to compress the entire `.neo-ai-data` directory into `neo-ai-data.zip`.
2. **`buildScripts/ai/downloadKnowledgeBase.mjs`**: Re-target the fetch logic to pull `neo-ai-data.zip` and validate the existence of the `.neo-ai-data` directory on the filesystem.
3. **`AI_QUICK_START.md`**: Update Step 3.1 instructions instructing new users to check for the `.neo-ai-data` hidden folder instead of the deprecated `chroma-neo-knowledge-base` string.

## Timeline

- 2026-04-06T16:07:38Z @tobiu added the `documentation` label
- 2026-04-06T16:07:38Z @tobiu added the `enhancement` label
- 2026-04-06T16:10:50Z @tobiu referenced in commit `87069c0` - "build: Update AI artifact pipelines to encapsulate hidden .neo-ai-data unified matrix (#9735)"
- 2026-04-06T16:11:07Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T16:11:09Z

Successfully re-routed download and upload automation scripts to encapsulate the `.neo-ai-data` directory, guaranteeing that future AI artifact releases properly contain both the legacy ChromaDB and new SQLite multi-vector graph.

- 2026-04-06T16:11:10Z @tobiu closed this issue

