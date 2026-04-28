---
name: ticket-intake
description: Authoritative protocol defining the "Pre-Execution Reflection Gate". Mandates architectural validation, negative ROI calculation, and duplicate sweeps before an agent is permitted to begin working on a GitHub Issue.
triggers: Use this skill immediately when assigned a new ticket, before checking out a branch or writing any codebase modifications.
---

# Ticket Intake Skill

If you are an agent tasked with executing a ticket or issue, you MUST NOT begin executing Git branch commands or writing code.

You MUST immediately use the `view_file` tool to read and strictly adhere to `.agent/skills/ticket-intake/references/ticket-intake-workflow.md` before proceeding. Or, if you already have the payload in context, proceed directly to its directives.

**Verify-Before-Assert Integration:**
At intake, you MUST apply the **Verify-Before-Assert Pre-Flight Check** (`AGENTS.md` §2.3) to the ticket's foundational premise. You cannot assume the ticket's claims about the codebase are true without first empirically validating them (e.g., using `query_documents` or `ask_knowledge_base`).
