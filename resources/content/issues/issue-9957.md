---
id: 9957
title: Scaffold pull-request Progressive Disclosure Skill
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T09:34:08Z'
updatedAt: '2026-04-13T09:34:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9957'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Scaffold pull-request Progressive Disclosure Skill

### Goal
Remove raw Git and `gh` execution mandates from the root `AGENTS.md` system prompt and isolate them into an on-demand `pull-request` skill.

### Implementation Checklist
- [ ] Use the `create-skill` architecture to scaffold `.agent/skills/pull-request/SKILL.md`.
- [ ] Document the native Git sequence (`git checkout`, `git commit`, `gh pr create --fill`).
- [ ] Embed the `signal_state_transition` execution mandate as the final algorithmic step of the skill.
- [ ] Incorporate the 'Stepping Back' reflective protocol explicitly within the act of opening a PR entirely autonomously, without coupling it to the `pr-review` phase.

## Timeline

- 2026-04-13T09:34:09Z @tobiu added the `documentation` label
- 2026-04-13T09:34:09Z @tobiu added the `enhancement` label
- 2026-04-13T09:34:10Z @tobiu added the `ai` label
- 2026-04-13T09:34:19Z @tobiu added parent issue #9950

