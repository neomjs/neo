---
name: ticket-create
description: "Authoritative protocol for creating Neo.mjs GitHub issues. Enforces duplicate sweep, Fat Ticket body structure, strict label rules, title hygiene, and the six-stage challenge chain at creation time. CRITICAL: Do NOT run default `npx playwright test` to verify issues; Neo uses multiple custom playwright configs (e.g., unit, e2e) which must be explicitly targeted. Use immediately before calling the create_issue MCP tool. Triggers: Use this skill before any invocation of the create_issue MCP tool. This is the creation-side dual of ticket-intake (which consumes existing tickets)."
---

# Ticket Create Skill

## §0 — Prio-0 Sanity Gate (judgment before machinery)

Before the duplicate sweep, the Fat-Ticket body, or the six-stage chain, answer from your understanding of the roadmap: **does this ticket make sense, and does it fit the current architecture and goals?** If the proposed work builds a toaster when we need a car, do not file it — reshape or reject the premise. A perfectly-structured ticket for the wrong work is still the wrong work; the machinery below cannot fix a wrong premise.

If you are about to create a new GitHub issue, you MUST NOT compose the title, body, or labels ad-hoc — and you MUST NOT skip the pre-creation duplicate sweep.

You MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/ticket-create/references/ticket-create-workflow.md` before proceeding. Or, if you already have the payload in context, proceed directly to its directives.
