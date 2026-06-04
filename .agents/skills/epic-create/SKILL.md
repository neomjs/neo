---
name: epic-create
description: "Authoritative protocol for authoring an Epic body — the creation-side dual of `ticket-create` + entry partner of `epic-review`/`epic-resolution`. Enforces: epic body = problem-scope + intended-solution (NOT pseudo-subs / ACs); ACs live in the SUB tickets; subs are LINKED via `update_issue_relationship` + added incrementally; the body MUST NOT hardcode a sub-list (it stales out → FAIL). Triggers: before creating an Epic (a parent issue labeled `epic`) via `create_issue`, or before decomposing one into sub-tickets."
---
# Epic Create Skill
If you are about to author an Epic (a parent issue labeled `epic`) or decompose one into sub-tickets, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/epic-create/references/epic-create-workflow.md` before proceeding.
