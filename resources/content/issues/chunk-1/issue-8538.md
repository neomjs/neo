---
id: 8538
title: Configure MCP Server for Multi-Target Ticket Export (JSON/MD)
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T10:17:25Z'
updatedAt: '2026-07-06T13:22:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8538'
author: tobiu
commentsCount: 2
parentIssue: 8537
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Configure MCP Server for Multi-Target Ticket Export (JSON/MD)

Enhance the `neo.mjs-github-workflow` server to support configurable export targets.

**Requirements:**
- Update the server configuration to allow specifying export formats: `markdown` (current), `json` (new structured format), or `all`.
- Implement the logic to serialize GitHub GraphQL responses into the agreed "Hybrid JSON" schema (Structured Metadata + Event Stream + Markdown Body Strings).

## Timeline

- 2026-01-11T10:17:26Z @tobiu added the `enhancement` label
- 2026-01-11T10:17:27Z @tobiu added the `ai` label
- 2026-01-11T10:17:42Z @tobiu assigned to @tobiu
- 2026-01-11T10:17:55Z @tobiu added parent issue #8537
### @github-actions - 2026-04-12T04:24:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-04-12T04:24:36Z @github-actions added the `stale` label
- 2026-04-13T04:36:48Z @github-actions removed the `stale` label
### @neo-gpt - 2026-06-23T04:22:00Z

[ARCH_ALIGNMENT]

I am routing this out of code-ready status rather than closing it.

Fresh V-B-A:
- Live duplicate/successor search found #8538 itself, not a current replacement ticket for configurable GitHub Workflow export targets.
- `ai/mcp/server/github-workflow/config.mjs` exposes the sync directories, metadata, limits, archive settings, and markdown delimiter; I found no `exportFormat` / `exportTarget` / `markdown|json|all` switch.
- `ai/services/github-workflow/sync/IssueSyncer.mjs` still renders issues through `#formatIssueMarkdown()` and writes markdown files, then updates `_index.json` metadata entries. That is a markdown content pipeline with index metadata, not a parallel JSON export pipeline.
- `ai/services/github-workflow/sync/CONTENT_GRAMMAR.md` is the current source of authority for emitted issue/PR/discussion markdown grammar and downstream portal parsers.
- The requested "Hybrid JSON" schema is not defined in the repo outside this issue body. Implementing it directly from this ticket would force the PR author to invent a public data contract inside the implementation.

Routing decision: keep the idea open, but it needs a design/schema step before implementation. A code-ready successor should first define the JSON contract, expected consumers, compatibility with existing markdown files and `_index.json`, config defaults/migration, and whether issue/PR/discussion syncers all emit the same target set.


