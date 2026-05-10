---
id: 9703
title: Implement "Skill Creation" Meta-Skill
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T17:32:16Z'
updatedAt: '2026-04-04T17:36:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9703'
author: tobiu
commentsCount: 1
parentIssue: 9672
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T17:36:15Z'
---
# Implement "Skill Creation" Meta-Skill

### Background
The AI Assistant relies on a strict Anthropic Progressive Disclosure pattern for skills (a lightweight `SKILL.md` router and a heavier payload in a `/references` folder). Future agents in new sessions will lack the immediate context of how to properly structure these folders and what YAML frontmatter to apply.

### Goal
Create a "meta-skill" (a skill for creating skills) that acts as the authoritative template and instruction set for future agents when asked to create a new behavioral skill.

### Implementation Steps
1. Create `.agent/skills/create-skill/SKILL.md` with the appropriate trigger.
2. Create `.agent/skills/create-skill/references/skill-authoring-guide.md` detailing:
    - The mandatory folder structure (`.agent/skills/{skill-name}/`).
    - The exact YAML frontmatter requirements (`name`, `description`, `triggers`) to prevent system prompt bloat.
    - Examples of routing to a heavier `/references` document.

## Timeline

- 2026-04-04T17:32:18Z @tobiu added the `enhancement` label
- 2026-04-04T17:32:18Z @tobiu added the `ai` label
- 2026-04-04T17:32:23Z @tobiu added parent issue #9672
- 2026-04-04T17:36:05Z @tobiu referenced in commit `77b4158` - "docs(ai): implement create-skill meta-skill using progressive disclosure (#9703)"
- 2026-04-04T17:36:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T17:36:14Z

Skill creation meta-skill implemented. Added the standard directory structure including optional JS scripts/assets and explicitly warned against Python inside the Neo ecosystem. The Progressive Disclosure rule makes it the authoritative manual for future agents.

- 2026-04-04T17:36:16Z @tobiu closed this issue

