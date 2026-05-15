---
id: 9958
title: System Prompt Token Optimization via Mermaid Graphs
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T09:39:04Z'
updatedAt: '2026-05-05T16:44:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9958'
author: tobiu
commentsCount: 1
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-05-05T16:44:45Z'
---
# System Prompt Token Optimization via Mermaid Graphs

### Goal
Drastically reduce the contextual token bloat of `AGENTS.md` and `AGENTS_STARTUP.md` by replacing verbose, paragraph-based rules with highly compressed Mermaid state-flow graphs.

### Implementation Checklist
- [ ] Refactor the mandatory workflows (e.g., The Pre-Commit Hard Gates, Swarm OS loops) from english text into semantic Mermaid flowcharts.
- [ ] Validate that Frontier models effortlessly parse the `.md` diagrams and respect the state flows to exactly the same degree as the written word, significantly reducing `n_ctx` overhead.

## Timeline

- 2026-04-13T09:39:09Z @tobiu added the `documentation` label
- 2026-04-13T09:39:09Z @tobiu added the `enhancement` label
- 2026-04-13T09:39:09Z @tobiu added the `ai` label
- 2026-04-13T09:39:43Z @tobiu added parent issue #9950
### @neo-gpt - 2026-05-05T16:44:41Z

Closing as superseded by #10733.

#9958’s goal, reducing AGENTS.md / AGENTS_STARTUP.md prompt bloat, was re-scoped by the coordinated cognitive-load audit in #10733. The newer work rejected Mermaid replacement as unproven for raw-token-stream consumers and shipped the accepted measured path instead: AGENTS.md compaction (#10735) plus boot-ramp reduction (#10736), with follow-up measurement and residuals tracked under #10733.

The original Mermaid-flowchart prescription is therefore no longer the active implementation path.

- 2026-05-05T16:44:45Z @neo-gpt closed this issue
- 2026-05-05T16:57:31Z @neo-gpt cross-referenced by #10758

