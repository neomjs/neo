# Ticket: Create Class Hierarchy YAML

GH ticket id: #7246

**Assignee:** Gemini
**Status:** Done

## Description

The current `docs/output/structure.json` file is too large and inefficient for AI agent consumption. To provide a lean but effective overview of the project's class structure, we will create a new build artifact.

## Goal

Modify the `buildScripts/docs/jsdocx.mjs` script to generate a new file at `docs/output/class-hierarchy.yaml`.

### Requirements:

1.  **Format:** The file must be in YAML.
2.  **Content:** It will contain a simple key-value mapping of `className: parentClassName`.
3.  **Sorting:** The entries must be sorted alphabetically by the `className` (the key).
4.  **Implementation:** This will be done within the existing `jsdocx.mjs` script, leveraging the already-parsed documentation data.
5.  **Agent Integration:** Update `AGENTS.md` to instruct the agent to parse `docs/output/class-hierarchy.yaml` instead of the old `structure.json` file.
