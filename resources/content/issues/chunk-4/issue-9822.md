---
id: 9822
title: Fix Regression in DreamService Golden Path Inference Tests
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T11:54:06Z'
updatedAt: '2026-04-09T12:48:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9822'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T11:54:31Z'
---
# Fix Regression in DreamService Golden Path Inference Tests

## Problem Context
During the recent `DreamService` migration to a background daemon, the test file `DreamService.spec.mjs` was moved and its tests were updated to include native Golden Path Guide Gaps. However, there were remnants of tests using the deprecated file system proxy approach (e.g. `expect(appendedContent.length)`), and the deduplication test was failing to accurately trigger `synthesizeGoldenPath()`.

## Fix Description
- Merged the Golden Path duplicates/idempotence check directly into the correctly mocked `synthesizeGoldenPath` unit test to prevent SQLiteVectorManager crash.
- Transitioned capability gap assertions to read from the strictly typed native SQLite Db properties (`GraphService.db.nodes.get().properties.capabilityGap`) instead of the mock file array proxy.
- Verified final export pipeline in `ai/services.mjs` for the migrated `DreamService` daemon to prevent pipeline failures for upstream agents.

## Timeline

- 2026-04-09T11:54:09Z @tobiu added the `bug` label
- 2026-04-09T11:54:09Z @tobiu added the `ai` label
- 2026-04-09T11:54:16Z @tobiu referenced in commit `f29e49b` - "fix: Resolve DreamService Golden Path test drift and SDK export pipeline (#9822)"
- 2026-04-09T11:54:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T11:54:29Z

Successfully resolved Golden Path deduplication regression in DreamService.spec.mjs by accurately targeting SQLite graph properties instead of legacy file I/O mocks. Migrated DreamService is now exposed natively via the ai/services.mjs SDK.

- 2026-04-09T11:54:31Z @tobiu closed this issue
- 2026-04-09T12:47:37Z @tobiu referenced in commit `ace94ae` - "fix(ai): Stable DreamService Memory Core integration (#9822)"
### @tobiu - 2026-04-09T12:48:00Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The DreamService vector fallback errors and capability gap reporting have been fully resolved with native local processing.
> 
> **Key Changes:**
> - Migrated legacy `QueryService` calls to a direct lexical matched search within the SQLite `GraphService.db.nodes.items` list, retaining LLM semantic validation from local `.md` sources directly rather than querying the ChromaDB layer.
> - Fixed a boolean error in `[TEST_GAP]` evaluation (`n.label` -> `n.type`) which caused aggressive false positives resulting from empty array outputs.
> - Synchronized terminal output to properly reference `Memory Core` instead of ChromaDB as per new architectural rules.
> - Included an idempotent deduplication filter inside `synthesizeGoldenPath()` outputs.
> 
> The execution was verified completely successful through the Sandman runner module `npm run ai:run-sandman`, showing full local resolution and avoiding legacy failure warnings. This successfully achieves our "100% Native Edge Graph" directive!


