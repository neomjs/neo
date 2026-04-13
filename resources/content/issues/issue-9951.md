---
id: 9951
title: Scaffold submit_work MCP Meta-Tool
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:30Z'
updatedAt: '2026-04-13T09:28:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9951'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Scaffold submit_work MCP Meta-Tool

### Goal
Abstract Git branching, committing, and GitHub PR creation completely away from the LLM prompt.

### Implementation Checklist
- [ ] Enhance the `neo-mjs-github-workflow` MCP server with a `submit_work(ticketId, summary)` tool.
- [ ] Implement Node.js execution logic to safely branch (`git checkout -b`), stash, commit, and open the PR programmatically without LLM hallucination risk.
- [ ] Ensure the orchestration gracefully traps this state to trigger the subsequent PR review phase.

## Timeline

- 2026-04-13T09:28:33Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:33Z @tobiu added the `ai` label
- 2026-04-13T09:28:33Z @tobiu added the `architecture` label
- 2026-04-13T09:28:47Z @tobiu added parent issue #9950

