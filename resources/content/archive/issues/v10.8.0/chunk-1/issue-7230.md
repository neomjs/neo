---
id: 7230
title: Refine AGENTS.md for Enhanced Agent Workflow
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-22T01:56:33Z'
updatedAt: '2025-09-22T02:05:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7230'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-22T02:05:14Z'
---
# Refine AGENTS.md for Enhanced Agent Workflow

## 1. Overview

This ticket covers structural and content refinements to `AGENTS.md` to improve the AI agent's workflow, clarity, and proactive contribution to the knowledge base.

## 2. Scope of Work

### 2.1. Enhance `AGENTS.md` with New Query Strategies and Knowledge Base Contribution

-   **Task:** Update the AI agent guidelines to introduce a proactive strategy for knowledge base enhancement and refine existing query strategies.
-   **Implementation:**
    -   **Revise "Query Strategies" section:**
        -   Introduce "Targeted Content-Type Searching" with examples using the `--type` flag.
        -   Introduce the "Knowledge Base Enhancement Strategy: Contributing Intent-Driven Comments" section, detailing how the agent should analyze code and generate comments when context is lacking. This strategy is to be applied during the analysis phase of the Development Workflow.
        -   Adjust the "When Queries Fail to Find Information" section to account for the new enhancement strategy.
    -   **Update "Development Workflow" section:** Modify step 2 ("Analyze Existing Code & Enhance Documentation") to explicitly state that the agent should apply the "Knowledge Base Enhancement Strategy" if source code lacks intent-driven comments.
    -   **Relocate "This Changes the Workflow" section:** Move this summary section to immediately follow the "Development Workflow" section to improve document flow.
    -   **Correct Cross-Reference:** Fix the reference to the "Knowledge Base Enhancement Strategy" in the "Development Workflow" section to be title-based instead of a specific section number.

## 3. Acceptance Criteria

-   `AGENTS.md` is updated with clear and accurate instructions on using the new strategies and reflects the refined workflow.
-   The agent's workflow is clearly defined to include proactive documentation enhancement.

## Timeline

- 2025-09-22T01:56:33Z @tobiu assigned to @tobiu
- 2025-09-22T01:56:34Z @tobiu added the `enhancement` label
- 2025-09-22T01:56:54Z @tobiu referenced in commit `3983178` - "Refine AGENTS.md for Enhanced Agent Workflow #7230"
- 2025-09-22T02:05:14Z @tobiu closed this issue

