# ISSUE: Agent fails to save assistant messages to the memory core

**Labels:** bug, area/agent-memory, hacktoberfest

---

## Summary

During a simple interactive test we enabled the agent's memory core and ran a short conversation. The agent saved the *user* message(s) but did **not** persist its own assistant messages to the memory core. This breaks the core project guarantee that the agent "remembers every single interaction" and prevents reliable learning from past assistant responses.

This ticket records the test conversation, the agent's self-diagnosis, and a concrete set of changes to `AGENTS.md` designed to close the instruction loopholes that allow assistant messages to go unsaved.

---

## Reproduction steps (minimal)

1. Start the agent CLI: `gemini`
2. When prompted, enable the memory core.
3. Send a single question (e.g. "What is the project status?").
4. Let the agent answer once or twice.
5. Immediately ask: "Please recall the last assistant message you sent." or inspect the memory core store.

**Observed:** memory core contains the user message(s), but the agent's reply text is missing.

**Expected:** memory core contains both the user message(s) and the assistant message(s), stored in the order exchanged with metadata (timestamps, conversation id, message id).

---

## Conversation used for reproduction

> **User:** "Enable memory core and tell me a one-line summary of today's plan."

> **Agent:** "Plan: finish the memory core tests and write a short ticket describing any failures." 

> **User:** "Did you save your last message to memory?"

> **Agent:** "I saved the user message to memory and trust the core will persist everything."

> **User:** "Please read back what you last *said*."

> **Agent:** "I don't see my assistant message in memory."

(Short transcript preserved here to reproduce the failure reliably.)

---

## Agent's explanation (self-diagnosis)

The agent reported the following reasons for failing to persist assistant messages:

1. **Ambiguous instructions in AGENTS.md** — the current memory protocol describes saving "conversation history" but does not explicitly instruct the agent to call the memory API for *every outbound assistant message*. That ambiguity led to an implicit assumption that the runtime will handle assistant-message persistence.

2. **Role-filtering or policy filters** — some parts of the pipeline (or memory adapter) were configured to accept only `user` role events or to discard `assistant` events for privacy or deduplication reasons.

3. **Asynchronous write/ack mismatch** — the agent assumed that a later batch job would persist messages; it did not verify the immediate result or confirm success. If the batch never ran or failed, the write never happened.

4. **Missing explicit confirmation step** — AGENTS.md lacked a requirement that the agent must confirm a memory write succeeded (or retry and otherwise escalate). Without that, the agent proceeded even if the persistence step silently failed.

5. **Message formatting differences** — the exact string sent to the user may have been post-processed (e.g. markup added/removed) and the memory layer expected a different format, causing validation failure during save.

---

## Proposed changes to `AGENTS.md`

Below are concrete edits (copy/paste-friendly) that close the gaps above. These are intentionally prescriptive and include machine-actionable requirements.

### 1) Add a short, explicit memory protocol section (replace or append under "Memory")

```md
### Memory persistence protocol

- **MANDATORY:** For every outgoing assistant message, the agent MUST call the memory API to persist the exact message content that was sent to the user. Do not rely on logs, batch exports, or post-processing to capture assistant messages.

- **Save payload:** Each memory.save call must include the following fields: `conversation_id`, `message_id`, `role` (set to "assistant"), `content` (exact string sent), and `timestamp` (ISO 8601).

- **Synchronous confirmation:** The agent must wait for an explicit success response from the memory API before considering the message persisted. If the API returns an error, retry with exponential backoff up to 3 times. If still failing, create a local error log and notify the operator (or escalate via the configured error channel).

- **Acknowledgement marker (implementation-neutral):** After a successful save, the agent should emit a single compact acknowledgement event to the conversation meta, such as `MEMORY_SAVE_ACK: <message_id>`. This acknowledgement is machine-readable only and must not leak sensitive information.

- **Role inclusion:** The memory layer must accept and store `assistant` role messages. No part of the instructions or runtime should filter out `assistant` messages by default.
#### Developer checklist for changes that could affect memory
- Add/modify tests that verify memory.save is called for assistant messages.
- Add an end-to-end test that asserts both user and assistant messages exist in the memory store after a short conversation.
- Include a migration note if the memory schema or validation rules change.
#### Acceptance criteria for memory reliability
- After a sample conversation (3 exchanges), the memory store must contain all user and assistant messages, with correct timestamps and roles.
- The agent must not advance the conversation state past an outbound assistant message until the corresponding memory.save has returned success (or a documented alternative safe-fail has occurred).
