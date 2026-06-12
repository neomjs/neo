---
id: 9993
title: 'AI Target: Deprecate Legacy DOC_GAP Inference in DreamService'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-14T08:19:16Z'
updatedAt: '2026-04-14T10:34:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9993'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-14T10:22:34Z'
---
# AI Target: Deprecate Legacy DOC_GAP Inference in DreamService

### Architectural Paradox

The `DreamService` REM pipeline historically used `jsdocx` output (`structure.json` / `all.json`) to score `[DOC_GAP]` penalties against Graph Nodes. 

However, we identified a critical structural flaw during the evaluation of Swarm Intelligence heuristics:
- `jsdocx` is fundamentally a human-centric format that inherently omits undocumented codebase entities. Consequently, attempting to map missing entities by joining against it creates a paradox (verifying an Abstract Syntax entity against a manifest that dropped it).
- **Negative ROI:** Agentic SLMs and LLMs natively parse source code AST. Training the Swarm to focus processing power on closing JSDoc syntax gaps generates unhelpful noise that obscures high-value test (`[TEST_GAP]`) and systemic component (`[TOPOLOGY_GAP]`) priorities.

### Resolution

Instead of patching the deterministic verification loop on a flawed documentation JSON file, we have evaluated and executed a hard pivot:

1. **Deprecated Logic:** Eradicated the legacy `[DOC_GAP]` routine from `DreamService.mjs` and related capability inference.
2. **Shifted Weighting:** Re-centered the processing capacity strictly toward code maturity (`[TEST_GAP]`) and strategic architectural context (`[GUIDE_GAP]`).
3. **Paving the Way:** This resolves the operational noise blocking the future `[TOPOLOGY_GAP]` Swarm architectural mapping.

### Handoff Context

Pull Request #9996 handles the removal and unit test rectifications.

## Timeline

- 2026-04-14T08:19:17Z @tobiu added the `bug` label
- 2026-04-14T08:19:17Z @tobiu added the `ai` label
- 2026-04-14T09:32:06Z @tobiu assigned to @tobiu
- 2026-04-14T10:01:22Z @tobiu referenced in commit `30402c3` - "fix(ai): remove low-ROI DOC_GAP detection from DreamService (#9993)"
- 2026-04-14T10:01:47Z @tobiu cross-referenced by PR #9996
- 2026-04-14T10:03:29Z @tobiu changed title from **Refactor Doc Gap Detection to Properly Parse JSDoc Content** to **AI Target: Deprecate Legacy DOC_GAP Inference in DreamService**
- 2026-04-14T10:09:51Z @tobiu referenced in commit `2948ed0` - "fix(ai): remove low-ROI DOC_GAP detection from DreamService (#9993)"
- 2026-04-14T10:22:34Z @tobiu referenced in commit `b3ec954` - "fix(ai): remove low-ROI DOC_GAP detection from DreamService (#9993) (#9996)

* fix(ai): remove low-ROI DOC_GAP detection from DreamService (#9993)

* fix(ai): remove DOC_GAP output from DreamService REM logging"
- 2026-04-14T10:22:34Z @tobiu closed this issue

