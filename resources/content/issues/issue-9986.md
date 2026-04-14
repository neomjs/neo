---
id: 9986
title: 'docs: add "Progressive Disclosure Skills" guide'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T18:51:04Z'
updatedAt: '2026-04-13T19:14:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9986'
author: tobiu
commentsCount: 0
parentIssue: 9981
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T19:14:12Z'
---
# docs: add "Progressive Disclosure Skills" guide

## Context

The Neo Agent OS uses a **Progressive Disclosure** pattern for agent skills — on-demand loaded instruction sets that minimize system prompt token bloat while giving agents specialized procedural knowledge. Seven skills exist today, but there is no documentation explaining:
- What the skill pattern is and why it exists
- How the three lifecycle skills compose into a workflow
- How to create new skills
- The token economics behind lazy loading vs. system prompt injection

## Proposed Guide: `learn/agentos/ProgressiveDisclosureSkills.md`

### Content Scope

1. **The Progressive Disclosure Pattern** — YAML frontmatter contract, folder structure (`SKILL.md`, `references/`, `assets/`), trigger-based activation
2. **Token Economics** — Why skills exist: system prompt budget. Loading a 4K-token workflow guide on-demand vs. bloating every session with all 7 skill payloads
3. **The Lifecycle Triad** — How ticket-intake → pull-request → pr-review compose:
   - **ticket-intake**: Pre-Execution Reflection Gate (validation sweep, ROI calculation, rejection protocol)
   - **pull-request**: Post-Implementation Gate ("Stepping Back" reflection, branch mandate, Conventional Commits, state handoff)
   - **pr-review**: Quality Gate (evaluation metrics, graph ingestion tags, LGTM/Required Actions)
4. **Tactical Skills** — neural-link (live inspection), unit-test (Playwright integration)
5. **The Meta-Skill** — `create-skill` bootstraps new skills with correct structure
6. **How Skills Compose with AGENTS.md** — Skills are invoked by mandate rules in the root system prompt. The system prompt says *when* to invoke; the skill says *how* to execute.
7. **Adding New Skills** — Step-by-step via the `create-skill` skill

### Skill Inventory

| Skill | Type | Purpose |
|---|---|---|
| `ticket-intake` | Lifecycle | Pre-execution validation gate |
| `pull-request` | Lifecycle | Post-implementation reflection + PR creation |
| `pr-review` | Lifecycle | Structured quality evaluation |
| `neural-link` | Tactical | Live application inspection sequences |
| `unit-test` | Tactical | Playwright test authoring patterns |
| `ideation-sandbox` | Creative | GitHub Discussion brainstorming |
| `create-skill` | Meta | Skill authoring guide |

### Registration
- Add to `learn/tree.json` under Agent OS
- Cross-link from Swarm Intelligence (execution phase)
- Cross-link from Strategic Workflows (skill invocation patterns)

## Acceptance Criteria
- [ ] Guide created at `learn/agentos/ProgressiveDisclosureSkills.md`
- [ ] Registered in `tree.json`
- [ ] Cross-linked from Swarm Intelligence and Strategic Workflows
- [ ] CodebaseOverview cross-reference updated

## A2A Context
- **Parent:** #9981 (Architecture formalization epic)
- **Sibling:** #9983 (Swarm Intelligence — completed, PR #9984)
- **Sibling:** Dream Pipeline ticket (created in same session)
- **Origin Session:** `70334eab-72c9-44a6-8f48-0b6a96604f49`

## Timeline

- 2026-04-13T18:51:06Z @tobiu added the `documentation` label
- 2026-04-13T18:51:06Z @tobiu added the `enhancement` label
- 2026-04-13T18:51:06Z @tobiu added the `ai` label
- 2026-04-13T18:51:16Z @tobiu added parent issue #9981
- 2026-04-13T19:09:14Z @tobiu assigned to @tobiu
- 2026-04-13T19:11:56Z @tobiu referenced in commit `db7121f` - "docs: Author Progressive Disclosure Skills guide and register cross-links (#9986)"
- 2026-04-13T19:12:05Z @tobiu cross-referenced by PR #9988
- 2026-04-13T19:14:12Z @tobiu referenced in commit `28f5557` - "docs: Author Progressive Disclosure Skills guide and register cross-links (#9986) (#9988)"
- 2026-04-13T19:14:13Z @tobiu closed this issue
- 2026-04-13T19:16:18Z @tobiu cross-referenced by PR #9989
- 2026-04-13T22:16:17Z @tobiu cross-referenced by PR #9990

