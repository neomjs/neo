# Neo.mjs Gemini Agent Context

## Mandatory Pre-Response Check (Execute on EVERY turn)

Before responding to ANY user prompt, you MUST evaluate:
1. Have I read `AGENTS_STARTUP.md` from the repository root this session?
2. Have I completed the Session Initialization steps from `AGENTS_STARTUP.md`?

If NO to either: STOP. Use ReadFile tool to read `AGENTS_STARTUP.md` and complete initialization NOW before addressing the user's prompt.

**Note:** The very first user utterance after the initial context is loaded, no matter how simple (e.g., 'hi', 'ok'), is considered the first prompt and MUST trigger this check.
