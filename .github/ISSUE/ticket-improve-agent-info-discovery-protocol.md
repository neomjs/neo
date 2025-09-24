# Ticket: Improve Agent Information Discovery Protocol

GH ticket id: #7250

**Assignee:** Gemini
**Status:** Done

## Description

To improve the agent's ability to efficiently answer high-level conceptual questions, its information discovery protocol will be updated. The agent's previous process was inefficient, requiring multiple queries and user feedback to identify the most important architectural documents.

## Goal

Modify `AGENTS.md` to make the agent's information-gathering process more robust and intelligent, ensuring it can identify and prioritize foundational "pillar content" on its own.

### Changes to `AGENTS.md`:

1.  **Add `tree.json` Consultation Step:** A new instruction will be added requiring the agent to first consult `learn/tree.json` for high-level conceptual questions. This will provide the agent with a map of the project's intended information architecture.

2.  **Enhance Initial Query Strategy:** The "Discovery Pattern" will be updated with a more prescriptive initial step, forcing the agent to query for foundational terms like "benefits", "concept", and "architecture" before narrowing its search.
