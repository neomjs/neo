# Pull Request Review Guide

This document outlines the authoritative protocol for structuring Pull Request Reviews within the Neo.mjs project. 
Whether you are a human reviewer or an autonomous Agent evaluating code, you must adhere to this structure.

This protocol ensures that feedback is:
1. **Constructive and Engaging:** Encouraging to first-time contributors while remaining technically precise.
2. **Actionable:** Clearly delineating block-level requirements before a merge can occur.
3. **Graph-Extractable:** Structured with specific Markdown tags so the background Retrospective Agent (Gemma 4:31B) can mathematically ingest the feedback into the Native Edge Graph.

## 1. Core Philosophy
- **For Internal Agents:** Be objective, clinical, and strict. Enforce the "Fat Ticket" protocol and strict JSDoc completeness.
- **For External/First-Time Contributors:** Start with positive reinforcement. Acknowledge their effort. Provide explicit, helpful examples when asking for changes.

## 2. Agent Operational Mandates
If you are an AI Agent tasked with writing a PR review directly on GitHub, you MUST follow this protocol:
1. **Context Initialization:** You MUST retrieve the state of the PR using `get_pull_request_diff` and `get_conversation` (via the `neo-mjs-github-workflow` MCP server) before formulating your review.
2. **Execution:** Once formulated, use the `manage_issue_comment` MCP tool (action: `create`) to post the review directly onto the PR thread, or formulate it in markdown locally if MCP is disconnected.

## 3. Structural Evaluation Metrics
Every PR review MUST score the work across the following categories on a scale of `0` to `100`:

*   **`[ARCH_ALIGNMENT]`** (0-100): Does it follow Neo.mjs paradigms (e.g., worker delegation, push-based reactivity, config-driven components)?
*   **`[CONTENT_COMPLETENESS]`** (0-100): Are all new or modified methods documented with 'Anchor & Echo' JSDoc? Is the PR description a comprehensive "Fat Ticket"?
*   **`[EXECUTION_QUALITY]`** (0-100): Code flow, absence of bugs, race condition safety, VDOM syncing correctness, and testing coverage.
*   **`[PRODUCTIVITY]`** (0-100): Were the primary goals of the linked ticket achieved?
*   **`[IMPACT]`** (0-100): What is the significance of the change? (100 = critical framework architecture, 10 = trivial typo fix).
*   **`[COMPLEXITY]`** (0-100): Factor in file touchpoints, depth of changes (core vs. app-level), and cognitive load.
*   **`[EFFORT_PROFILE]`**: Categorize the effort relative to the Impact/Complexity ratio to establish explicit Native Graph labels. Valid values are: `Quick Win` (High ROI/Low Complexity), `Heavy Lift` (High Complexity/High Impact), `Maintenance` (Routine tasks), or `Architectural Pillar` (Fundamental shifts).

## 4. Graph Ingestion Tags
To bridge the gap between human/agent code review and the internal Agent OS memory, you MUST use the following explicit markdown tags for any critical feedback. 
The Retrospective daemon explicitly regex-matches these tags during REM sleep:

*   **`[KB_GAP]`**: Use this to document missing concepts, misunderstandings of framework logic, or areas where the developer (or agent) clearly lacked documentation.
*   **`[TOOLING_GAP]`**: Use this to document failures in the development workflow, broken test commands, or MCP tools that failed during the generation of the PR.
*   **`[RETROSPECTIVE]`**: Use this for high-level takeaways or architectural praise.

## 5. Required Actions & Cross-Linking
*   **Related Graph Nodes:** Every PR review MUST list related graph nodes (e.g., `Target Epic ID`, `Issue ID`) to ensure the Native Edge Graph links the evaluation to the overarching goal.
*   **Required Actions:** Clearly list a bulleted checklist of mandatory changes required before the PR can be accepted.

## 6. The Review Template
When drafting your review, use the `view_file` tool to load the exact markdown template from:
`/Users/Shared/github/neomjs/neo/.agent/skills/pr-review/assets/pr-review-template.md`
