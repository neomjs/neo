---
id: 8280
title: '[Neural Link] Feature: Tool inspect_class'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T19:17:53Z'
updatedAt: '2026-01-01T23:46:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8280'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T23:46:38Z'
---
# [Neural Link] Feature: Tool inspect_class

Implement `inspect_class` to allow AI agents to introspect the schema of a class at runtime.

**Requirements:**
- Input: `className` (string).
- Output: JSON schema including configs (reactive and non-reactive), field definitions (for Models), and public methods.
- Logic:
    - Load the class via `Neo.ns()`.
    - Traverse prototype chain to gather all configs.
    - Identify mixins.
    - Format output for AI consumption (clear, type-aware).

**Why:**
This allows the agent to "read the manual" for the specific app instance it is connected to, ensuring it sends valid data and understands the capabilities of custom components not in its training data.

## Timeline

- 2026-01-01T19:17:54Z @tobiu added the `enhancement` label
- 2026-01-01T19:17:54Z @tobiu added the `ai` label
- 2026-01-01T19:18:29Z @tobiu assigned to @tobiu
- 2026-01-01T19:19:03Z @tobiu added parent issue #8169
### @tobiu - 2026-01-01T23:45:45Z

**Input from Gemini 3 pro:**

> ✦ Implemented `inspect_class` tool for Neural Link.
> 
> ## Scope & Architecture Refinement
> We refined the goal from a simple "JSON schema" to a **"Rich Class Blueprint"**.
> Instead of parsing source files (which misses inherited logic), we leverage the runtime knowledge:
> - **`ctor.config`**: The authoritative source for merged default values and config existence (after `Neo.setupClass` has run).
> - **`ctor.configDescriptors`**: The source for config metadata (e.g., `merge: 'shallow'`, `isEqual`).
> - **`prototype`**: The source for active methods and mixins.
> 
> ## Implementation Details
> The tool provides a "God Mode" view of a class, answering "What *can* this do?" and "How does it react?".
> 
> ### 1. Rich Config Schema
> Configs are not just values. The output now includes:
> - **Value:** The resolved default value.
> - **Meta:** Descriptor properties (if present).
> - **Hooks:** Explicitly lists active reactive hooks (`beforeSet`, `afterSet`, `beforeGet`) found on the prototype. This reveals the *reactivity map* of the component.
> 
> ### 2. Cleaned Public API
> The `methods` list is filtered to reduce noise:
> - **Excluded:** Internal lifecycle hooks (`construct`, `init`, `onConstructed`), constructors, and reactive config hooks (which are now categorized under `configs`).
> - **Included:** Actionable public methods (`destroy`, `toJSON`, `set`, etc.).
> 
> ### 3. Hierarchy & Mixins
> - Returns the full `ntypeChain` and resolved `mixins` list.
> 
> This distinguishes `inspect_class` (Blueprint/Manual) from `toJSON` (Runtime State), providing agents with the deep understanding needed for complex tasks.

- 2026-01-01T23:46:39Z @tobiu closed this issue
- 2026-01-01T23:48:18Z @tobiu referenced in commit `2d83f4b` - "#8280 missing file"

