---
name: ticket-intake
description: "Authoritative protocol defining the \"Pre-Execution Reflection Gate\". Mandates architectural validation, negative ROI calculation, and duplicate sweeps before an agent is permitted to begin working on a GitHub Issue. Triggers: Use this skill immediately when assigned a new ticket, before checking out a branch or writing any codebase modifications."
---

# Ticket Intake Skill

## §0 — Prio-0 Sanity Gate (judgment before machinery)

Before you touch a branch or run any validation, answer from your understanding of the **current** architecture and goals: **does this ticket still make sense?** Tickets go stale — the world may have moved past it. If it builds a toaster when we now need a car, halt and challenge it (route back to the author/operator) before executing. Matching stale ACs is not the job; the machinery below cannot fix a wrong premise.

If you are an agent tasked with executing a ticket or issue, you MUST NOT begin executing Git branch commands or writing code.

You MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/ticket-intake/references/ticket-intake-workflow.md` before proceeding. Or, if you already have the payload in context, proceed directly to its directives.
