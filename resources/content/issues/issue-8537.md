---
id: 8537
title: 'GitHub Ticket Viewer V2: JSON-First Data Architecture'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-11T10:16:52Z'
updatedAt: '2026-01-11T10:16:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8537'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 8538 Configure MCP Server for Multi-Target Ticket Export (JSON/MD)'
  - '[ ] 8539 Update Ticket Index Scripts for JSON Generation'
  - '[ ] 8540 Implement Store-Driven VDOM Ticket Component (V2)'
subIssuesCompleted: 0
subIssuesTotal: 3
blockedBy: []
blocking: []
---
# GitHub Ticket Viewer V2: JSON-First Data Architecture

**Goal:** Re-architect the Portal's Ticket Viewer to use a JSON-first data pipeline, enabling "Zero Layout Thrashing" updates, superior performance, and AI-native structured data consumption.

**Strategic Shift:**
Move away from the V1 approach (Markdown-as-Data, Frontmatter parsing, HTML Injection) to a V2 approach (JSON-as-Data, Store-driven VDOM).

**Core Concepts:**
1.  **JSON Source of Truth:** The GitHub Workflow MCP server will export structured JSON (metadata + event stream) instead of/in addition to Markdown.
2.  **Hybrid Content:** JSON structure for metadata/timeline events; Markdown strings *only* for free-text bodies.
3.  **Store-Driven View:** A new `Portal.view.ticket.v2.Component` will bind to a `TicketStore`.
4.  **Delta Updates:** Timeline updates (new comments/labels) will be appended as single VNodes via Store events, eliminating full re-renders.

**Note:** This is a follow-up to the V1 implementation (Epic #8398).


## Timeline

- 2026-01-11T10:16:53Z @tobiu added the `enhancement` label
- 2026-01-11T10:16:53Z @tobiu added the `epic` label
- 2026-01-11T10:16:54Z @tobiu added the `ai` label
- 2026-01-11T10:16:54Z @tobiu added the `architecture` label
- 2026-01-11T10:17:00Z @tobiu assigned to @tobiu
- 2026-01-11T10:17:55Z @tobiu added sub-issue #8538
- 2026-01-11T10:17:58Z @tobiu added sub-issue #8539
- 2026-01-11T10:18:00Z @tobiu added sub-issue #8540

