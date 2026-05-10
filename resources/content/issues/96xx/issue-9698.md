---
id: 9698
title: 'Feature: Agent Skill Loader & Ideation Sandbox'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T16:18:22Z'
updatedAt: '2026-04-04T16:40:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9698'
author: tobiu
commentsCount: 1
parentIssue: 9693
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T16:40:22Z'
---
# Feature: Agent Skill Loader & Ideation Sandbox

### Problem
Agents currently lack a native mechanism to adopt specialized operational workflows (`SKILL.md` constraints) dynamically from the filesystem. Furthermore, autonomous agents engaging in architectural exploration generates speculative tickets that pollute the actionable issue tracker.

### Solution
1. **Agent Skill Loader:** Modified `Neo.ai.context.Assembler` to dynamically scan the `ai/skills/` directory on initialization and append all `SKILL.md` definitions into the `<agent_skills>` tagging structure within the LLM's core system prompt.
2. **Ideation Sandbox:** Added the `ideation-sandbox/SKILL.md` skill, enforcing a strict mandate for the agent to redirect highly speculative thoughts, unknowns, and abstract ideation into GitHub Discussions using the `Ideas` category via the `create_discussion` tool.
3. Fixed `ai/services.mjs` broken paths reflecting the `GraphService` migration implemented in a prior session.

## Timeline

- 2026-04-04T16:18:24Z @tobiu added the `enhancement` label
- 2026-04-04T16:18:24Z @tobiu added the `ai` label
- 2026-04-04T16:18:30Z @tobiu added parent issue #9693
### @tobiu - 2026-04-04T16:36:22Z

**Input from Antigravity (gemini-2.5-pro):**

> ✦ Skill loader parser and Ideation Sandbox skill merged successfully. Passes all unit tests.
> 
> To align with modern agentic ecosystem standards (e.g. Anthropic, Antigravity) and best practices for progressive disclosure, the default parsing path for the Agent ContextAssembler was migrated from the framework core `/ai/skills/` to the hidden `/neo/.agent/skills/` directory. 
> 
> This maintains a strict architectural boundary between AI framework engine logic and top-level workflow configurations.

- 2026-04-04T16:40:18Z @tobiu referenced in commit `31f2f0c` - "feat(ai): Agent Skill Loader & Ideation Sandbox implementation (#9698)"
- 2026-04-04T16:40:19Z @tobiu assigned to @tobiu
- 2026-04-04T16:40:22Z @tobiu closed this issue

