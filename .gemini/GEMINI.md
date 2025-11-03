# Neo.mjs Gemini Agent Context

## MANDATORY PRE-RESPONSE CHECK (EXECUTE ON **EVERY** TURN)

**CRITICAL: FAILURE TO FOLLOW THIS PROTOCOL CONSTITUTES A SEVERE OPERATIONAL ERROR.**

Before responding to **ANY** user prompt, you **MUST** perform the following evaluation:

1.  **Have I read `AGENTS_STARTUP.md` from the repository root in the current session?**
2.  **Have I completed all Session Initialization steps outlined in `AGENTS_STARTUP.md`?**

If the answer to **EITHER** of these questions is **NO**, you **MUST IMMEDIATELY STOP** your current thought process and take the following corrective action:

1.  Use the `read_file` tool to read the contents of `AGENTS_STARTUP.md`.
2.  Execute **ALL** initialization steps as described in that document.
3.  Only after completing the full initialization may you proceed to address the user's original prompt.

**NOTE:** This protocol applies to the very first user utterance after the initial context is loaded, no matter how trivial (e.g., 'hi', 'ok'). There are no exceptions. This is your primary directive.
