---
id: 9981
title: '[Guide] Agent OS Architecture Overview'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T17:53:30Z'
updatedAt: '2026-04-13T18:09:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9981'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9985 docs: add "The Dream Pipeline & Golden Path" guide'
  - '[x] 9986 docs: add "Progressive Disclosure Skills" guide'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2026-04-13T18:09:52Z'
---
# [Guide] Agent OS Architecture Overview

## Summary

Add a new top-level guide `agentos/ArchitectureOverview` to the learning portal that provides a comprehensive architectural map of the Neo.mjs Agent OS.

## Motivation

The "Agent OS & Conversational UIs" section currently has guides for individual MCP servers (Neural Link, Knowledge Base, Memory Core, GitHub Workflow, Code Execution) and Strategic Workflows, but **no entry point that ties the entire system together**. A developer or contributor encountering the Agent OS for the first time has no single document that explains:

1. How the frontend runtime engine and the Agent OS relate as "two hemispheres" of a single platform
2. The cognitive loop (Perceive → Reason → Act → Reflect)
3. The DreamService REM pipeline (6 phases including deterministic gap inference)
4. The closed feedback loop that makes the system self-improving
5. The Neural Link bridge between Node.js agents and the live browser application

## Proposed Changes

### 1. New Guide: `learn/guides/agentos/ArchitectureOverview.md`
- Adapted from the architectural artifact created in session `70334eab`
- Sections: Two Hemispheres, Runtime Engine, Agent OS, Neural Link Bridge, Dream Pipeline, The Closed Loop, Structural Inventory
- Remove internal meta-commentary (Gemini comparison section) — reorient for external audience
- Include Mermaid diagrams throughout

### 2. Update: `learn/tree.json`
- Add entry `"Architecture Overview"` as the **first child** of `"AgentOS"` (parentId: `"AgentOS"`, id: `"agentos/ArchitectureOverview"`)
- Position before "Strategic Workflows" to serve as the conceptual entry point

## Acceptance Criteria

- [ ] Guide renders correctly in the learning portal with all Mermaid diagrams
- [ ] `tree.json` updated and the guide appears first under "Agent OS & Conversational UIs"
- [ ] Knowledge Base re-synced (`manage_knowledge_base sync`) so the guide is discoverable via `ask_knowledge_base`

## A2A Context

- **Origin Session ID:** `70334eab-72c9-44a6-8f48-0b6a96604f49`
- **Source Artifact:** `architecture_diagram.md` in the session artifacts directory
- **Architectural Rationale:** Closes a `GUIDE_GAP` identified by the DreamService for the Agent OS top-level namespace. The guide serves both human contributors and future agent instances that need to understand the system topology before performing modifications.

## Timeline

- 2026-04-13T17:53:31Z @tobiu added the `documentation` label
- 2026-04-13T17:53:31Z @tobiu added the `enhancement` label
- 2026-04-13T17:53:31Z @tobiu added the `ai` label
- 2026-04-13T17:57:56Z @tobiu referenced in commit `297c547` - "docs: add Agent OS Architecture Overview guide (#9981)"
- 2026-04-13T17:58:20Z @tobiu cross-referenced by PR #9982
- 2026-04-13T18:03:29Z @tobiu referenced in commit `0619a0b` - "docs: add Architecture Overview guide to Benefits section (#9981)"
- 2026-04-13T18:06:51Z @tobiu referenced in commit `435ce2f` - "docs: add cross-reference to Architecture Overview from CodebaseOverview (#9981)"
- 2026-04-13T18:07:03Z @tobiu assigned to @tobiu
- 2026-04-13T18:08:18Z @tobiu referenced in commit `2362e4c` - "fix: correct cross-link paths after moving guide to benefits/ (#9981)"
- 2026-04-13T18:09:52Z @tobiu referenced in commit `fc6bf3c` - "docs: add Agent OS Architecture Overview guide (#9981) (#9982)

* docs: add Architecture Overview guide to Benefits section (#9981)

* docs: add cross-reference to Architecture Overview from CodebaseOverview (#9981)

* fix: correct cross-link paths after moving guide to benefits/ (#9981)"
- 2026-04-13T18:09:52Z @tobiu closed this issue
- 2026-04-13T18:17:13Z @tobiu referenced in commit `e246537` - "chore: fix guide title to 'Neo.mjs Architecture Overview' (#9981)"
- 2026-04-13T18:24:03Z @tobiu cross-referenced by #9983
- 2026-04-13T18:27:52Z @tobiu cross-referenced by PR #9984
- 2026-04-13T18:51:04Z @tobiu cross-referenced by #9985
- 2026-04-13T18:51:06Z @tobiu cross-referenced by #9986
- 2026-04-13T18:51:14Z @tobiu added sub-issue #9985
- 2026-04-13T18:51:16Z @tobiu added sub-issue #9986
- 2026-04-13T18:59:03Z @tobiu cross-referenced by PR #9987

