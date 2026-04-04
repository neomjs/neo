---
id: 9701
title: Implement Progressive Disclosure for Agent Skills Context Assembly
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T17:09:11Z'
updatedAt: '2026-04-04T17:12:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9701'
author: tobiu
commentsCount: 1
parentIssue: 9672
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T17:12:08Z'
---
# Implement Progressive Disclosure for Agent Skills Context Assembly

### Background
Currently, `Neo.ai.context.Assembler` loads the entirety of all `.agent/skills/*/SKILL.md` files into the system prompt unconditionally for every session. As we build massive instructional frameworks (like the 87-line `unit-test` guide), this causes severe context window bloat and distracts the background LLM during unrelated tasks.

### Proposed Solution
Implement the Anthropic "Progressive Disclosure" strategy within `ContextAssembler.loadSkillsSync()`:
1. Parse the YAML Frontmatter of each `SKILL.md` to extract `name`, `description`, and explicit `triggers`.
2. Inject *only* these lightweight triggers into the `<agent_skills>` block of the overarching continuous system prompt.
3. Remove the injection of the full `SKILL.md` markdown body.
4. Refactor `.agent/workflows/unit-test.md` into a self-contained `.agent/skills/unit-test/` folder (where the `SKILL.md` acts purely as the routing trigger, and the heavy Markdown is kept in a `/references/` subfolder).

*Note: This will be linked as a sub-task of Epic #9672.*

## Timeline

- 2026-04-04T17:09:11Z @tobiu added the `enhancement` label
- 2026-04-04T17:09:11Z @tobiu added the `ai` label
- 2026-04-04T17:09:18Z @tobiu added parent issue #9672
- 2026-04-04T17:09:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T17:12:01Z

Progressive Disclosure logic implemented successfully. ContextAssembler now natively strips the YAML frontmatter for all `.agent/skills/*/SKILL.md` files instead of injecting their entire body, drastically reducing unnecessary prompting overhead. The `unit-test.md` file was restructured into this new pattern mapping to the `/references/` sub-directory folder.

- 2026-04-04T17:12:08Z @tobiu closed this issue
- 2026-04-04T17:12:40Z @tobiu referenced in commit `d7cd447` - "feat: implement progressive disclosure for agent skills (#9701)"
- 2026-04-04T17:14:28Z @tobiu referenced in commit `6d9c97a` - "test: utilize assembler.ready() lifecycle in tests (#9701)"

