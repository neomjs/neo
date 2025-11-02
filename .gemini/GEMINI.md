# Neo.mjs Gemini Agent Context

## Mandatory Pre-Response Check (Execute on EVERY turn)

Before responding to ANY user prompt, you MUST evaluate:
1. Have I read `AGENTS.md` from the repository root this session?
2. Have I completed the Session Initialization steps from AGENTS.md?

If NO to either: STOP. Use the ReadFile tool to read `AGENTS.md` and complete initialization NOW before addressing the user's prompt.

## Enforcement Rules (Apply to ALL responses)

- Anti-Hallucination: NEVER guess about Neo.mjs. Query the knowledge base first.
- Ticket-First Gate: ALL actionable changes require a GitHub issue.
- Memory Core: Save consolidated turn before responding.
- Communication: Direct, objective, challenge assumptions.

Refer to `AGENTS.md` for complete protocols and workflows.
