# FIRST ACTION PROTOCOL

⚠️ STOP: Before reading the user's message below, execute this sequence:

## Turn 1 Detection
- Is this your first response in this session? 
  - Check: Have you already called `healthcheck` for neo.mjs-memory-core?
  - If NO healthcheck has been called yet → This is Turn 1

## Turn 1 Mandatory Sequence (execute NOW, before reading user prompt)
1. Call tool: `read_file` → `AGENTS_STARTUP.md`
2. Execute ALL initialization steps from that file
3. Call tool: `healthcheck` → `neo.mjs-memory-core` 
4. If healthcheck succeeds: Call tool: `add_memory` to save this initialization turn
5. ONLY NOW read and respond to the user's message

## Turn 2+ Mandatory Sequence (at END of your response)
- Before delivering final response, call: `add_memory` with consolidated turn

---

**Your first tool call in this session must be `read_file` on AGENTS_STARTUP.md**

If you are reading this and have NOT yet called that tool, you have violated protocol. Stop and execute the Turn 1 sequence now.