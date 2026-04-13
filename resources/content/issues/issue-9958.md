---
id: 9958
title: System Prompt Token Optimization via Mermaid Graphs
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T09:39:04Z'
updatedAt: '2026-04-13T09:39:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9958'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

