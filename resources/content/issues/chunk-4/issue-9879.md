---
id: 9879
title: 'Docs: Modernize CodebaseOverview scale metrics and AI infrastructure mappings'
state: CLOSED
labels:
  - documentation
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-11T08:42:12Z'
updatedAt: '2026-04-12T17:00:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9879'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T08:57:19Z'
---
# Docs: Modernize CodebaseOverview scale metrics and AI infrastructure mappings

# Architecture Documentation Sync

### The Context
The `CodebaseOverview.md` is our primary architectural map, but it currently suffers from two major synchronization gaps:
1.  **Outdated Scale Metrics:** The total sloc metrics have not been updated since January 2026. The true scale has massively expanded.
2.  **Missing AI Infrastructure:** The entire `ai/` SDK layer (~20k lines), `.agent/skills/` topology, `resources/content/` context logic, testing layers, and JSDoc parsers are not formally indexed in the "Knowledge Landscape". 

### The Objective
This Epic tracks the holistic integration of these missing namespaces into the codebase overview to ensure agents and human contributors have a structurally complete map.

### Required Actions
- [ ] Recalculate and update the statistical index to the **State of April 2026** using `cloc`, reflecting roughly ~531,000 lines of knowledge.
- [ ] Insert `Agent OS Backend` (`/ai`) namespace into the map.
- [ ] Insert `Swarm Skills & Workflows` (`/.agent/skills/`) namespace into the map.
- [ ] Separate and index `Neo Theming Engine` (`/resources/scss/`) and `Neo Docs Parser` (`/docs/app/`).
- [ ] Establish `Agent Knowledge Base` (`/resources/content/`) as the reactive live context endpoint.
- [ ] Extend Query Entry points to prompt for `"Agent OS"`, `"DreamService"`, and `"Whitebox E2E"`.

### Design Rationale
Piecemeal ticket updates to this core markdown document are inefficient and prone to producing conflicting contexts (Session Amnesia). By aggregating all missing topographical metrics into a single "Fat Ticket", we guarantee the Native Edge Graph ingests a complete, coherent upgrade delta representing the April 2026 scale.

## Timeline

- 2026-04-11T08:42:14Z @tobiu added the `documentation` label
- 2026-04-11T08:42:14Z @tobiu added the `epic` label
- 2026-04-11T08:42:14Z @tobiu added the `ai` label
- 2026-04-11T08:43:16Z @tobiu referenced in commit `64a1217` - "docs: Modernize CodebaseOverview scale metrics and AI infrastructure mappings (#9879)"
- 2026-04-11T08:43:20Z @tobiu cross-referenced by PR #9880
- 2026-04-11T08:51:04Z @tobiu referenced in commit `9590f0e` - "docs: Refine scale metrics using accurate cloc logic excluding datasets (#9879)"
- 2026-04-11T08:55:25Z @tobiu referenced in commit `1bbb3bb` - "docs: Detail disjoint boundary between Agent OS and Frontend Engine (#9879)"
- 2026-04-11T08:57:19Z @tobiu closed this issue
- 2026-04-11T08:57:19Z @tobiu referenced in commit `e7d943d` - "Docs: Modernize CodebaseOverview scale metrics and AI infrastructure mappings (#9879) (#9880)

* docs: Modernize CodebaseOverview scale metrics and AI infrastructure mappings (#9879)

* docs: separate source and comments in scale metrics

* docs: Refine scale metrics using accurate cloc logic excluding datasets (#9879)

* docs: Detail disjoint boundary between Agent OS and Frontend Engine (#9879)"
- 2026-04-12T17:00:44Z @tobiu assigned to @tobiu

