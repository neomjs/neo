---
id: 9672
title: 'Workflow Enablement: Implement Anthropic Agent Skills Standard'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T23:56:50Z'
updatedAt: '2026-04-05T14:55:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9672'
author: tobiu
commentsCount: 1
parentIssue: 9671
subIssues:
  - '[x] 9701 Implement Progressive Disclosure for Agent Skills Context Assembly'
  - '[x] 9702 Implement Neural Link Tactical Skill (Tool Chaining)'
  - '[x] 9703 Implement "Skill Creation" Meta-Skill'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-04-04T17:53:01Z'
---
# Workflow Enablement: Implement Anthropic Agent Skills Standard

## Problem
Currently, repetitive workflows (like parsing ASTs, validating UI components, or testing regressions) require the AI to organically reinvent the wheel each time based on system prompts. To scale autonomous operations, we need a portable, standardized way to teach agents specific, repeatable workflows.

## Proposed Solution
Implement the Anthropic standard for **Composable Agent Skills**. This enables the creation of reusable, folder-based expertise that any Neo.mjs subagent (or third-party tools like Claude Code/Cursor) can invoke.

## Requirements
1. **Directory Structure Parsing:** 
   - Update the Antigravity `Agent.mjs` (or a dedicated `SkillManager`) to scan a designated `skills/` directory.
   - Recognize that each skill is a discrete folder.
2. **`SKILL.md` Integration:**
   - Parse the mandatory `SKILL.md` file within each skill folder.
   - Extract the YAML frontmatter (`name`, `description`) to register the skill as an available slash command or tool.
   - Feed the markdown body instructions into the agent's context when the skill is invoked.
3. **Execution Context:**
   - Ensure the agent can access any supporting assets located in the skill's `scripts/`, `examples/`, or `resources/` subdirectories.

## Definition of Done
- The Agent SDK can dynamically load and list active skills from the filesystem.
- At least one "Hello World" or basic utility skill is created using the exact folder + `SKILL.md` structure to validate the parser.

## Timeline

- 2026-04-03T23:56:52Z @tobiu added the `epic` label
- 2026-04-03T23:56:52Z @tobiu added the `ai` label
- 2026-04-03T23:56:56Z @tobiu added parent issue #9671
- 2026-04-04T17:09:12Z @tobiu cross-referenced by #9701
- 2026-04-04T17:09:18Z @tobiu added sub-issue #9701
- 2026-04-04T17:23:48Z @tobiu cross-referenced by #9702
- 2026-04-04T17:23:51Z @tobiu added sub-issue #9702
- 2026-04-04T17:32:23Z @tobiu added sub-issue #9703
### @tobiu - 2026-04-04T17:52:52Z

**Input from Antigravity (Gemini):**

> ✦ With the successful instantiation of the `neural-link` skill, the `create-skill` meta protocol, and the Progressive Disclosure context reductions, **Phase 1: Workflow Enablement** is complete. Closing this Epic!

- 2026-04-04T17:53:01Z @tobiu closed this issue
- 2026-04-05T14:55:02Z @tobiu assigned to @tobiu

