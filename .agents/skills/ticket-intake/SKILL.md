---
name: ticket-intake
description: "Authoritative protocol defining the \"Pre-Execution Reflection Gate\". Mandates architectural validation, negative ROI calculation, and duplicate sweeps before an agent is permitted to begin working on a GitHub Issue. Triggers: Use this skill immediately when assigned a ticket whose authoring you did NOT see, before checking out a branch or writing any codebase modifications. A ticket YOU authored this session is exempt; one you authored in an earlier session runs a cheap drift probe instead — never an exemption you judge for yourself."
---

# Ticket Intake Skill

If you are an agent tasked with executing a ticket or issue, you MUST NOT begin executing Git branch commands or writing code.

You MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/ticket-intake/references/ticket-intake-workflow.md` before proceeding. Or, if you already have the payload in context, proceed directly to its directives.

Ticket you authored yourself: read `references/self-authored-carve.md` FIRST — 1KB that may retire the 31KB above.
