---
id: 9957
title: Scaffold pull-request Progressive Disclosure Skill
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T09:34:08Z'
updatedAt: '2026-04-13T13:04:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9957'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T13:04:28Z'
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
- 2026-04-13T12:47:54Z @tobiu referenced in commit `528e1e7` - "feat: progressive disclosure for pull request skill (#9957)"
- 2026-04-13T12:49:01Z @tobiu cross-referenced by PR #9968
- 2026-04-13T12:54:48Z @tobiu referenced in commit `33b2302` - "fix: chain pr-review skill for post-PR reflection (#9957)"
- 2026-04-13T12:57:27Z @tobiu referenced in commit `8702217` - "fix: prohibit autonomous agents from self-reviewing PRs (#9957)"
- 2026-04-13T12:59:08Z @tobiu referenced in commit `dcfb64b` - "fix: restore iterative polish mandate into the Pre-PR reflection phase (#9957)"
- 2026-04-13T13:03:42Z @tobiu referenced in commit `abf8a80` - "refactor: align Pre-COMMIT reflection explicitly with pr-review semantic guidelines (#9957)"
- 2026-04-13T13:04:28Z @tobiu closed this issue
- 2026-04-13T13:04:28Z @tobiu referenced in commit `ddf4b38` - "feat: progressive disclosure for pull request skill (#9957) (#9968)

* feat: progressive disclosure for pull request skill (#9957)

* fix: chain pr-review skill for post-PR reflection (#9957)

* fix: prohibit autonomous agents from self-reviewing PRs (#9957)

* fix: restore iterative polish mandate into the Pre-PR reflection phase (#9957)

* refactor: align Pre-COMMIT reflection explicitly with pr-review semantic guidelines (#9957)"

