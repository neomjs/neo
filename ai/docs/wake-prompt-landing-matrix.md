# Wake Prompt Landing Matrix

## Context

The wake substrate requires strict validation to ensure that "wake delivered" actually means the payload successfully landed in the target agent's prompt input surface. Previously, intermediate success (such as `osascript` exiting 0) was misinterpreted as full success, leading to regressions where payloads were pasted into source code files instead of agent composers.

This matrix establishes the definitive criteria that MUST be proven before wake delivery can be considered successful for any harness. A2A storage success and wake-daemon adapter success are necessary but **NOT sufficient** proof of prompt delivery.

## Wake Backlog / Subscription Isolation Preflight (MANDATORY)

Before running *any* controlled wake-delivery validation test, you MUST perform this preflight to prevent un-isolated backlog dumps from polluting the validation matrix:

1. **Inventory**: Inventory active wake subscriptions for all identities before the test.
2. **Halt**: Ensure the wake daemon is stopped and the swarm heartbeat is OFF.
3. **Neutralize Backlog**: Decide explicitly how the backlog is neutralized before wake-daemon start. This could be disabling non-target wake subscriptions, advancing/recording `lastSyncId` only after a durable-mailbox audit, or using a targeted wake-daemon/test harness path that ignores backlog.
4. **Isolate Test**: Only after neutralizing the backlog, create the unique matrix payload and start exactly ONE controlled delivery attempt.

## The Validation Matrix

The following criteria must be satisfied for each supported harness.

| Requirement | Claude Desktop | Antigravity IDE (Gemini) | Codex Desktop |
| :--- | :--- | :--- | :--- |
| **1. Message Persisted** | A2A message saved to local SQLite Memory Core. | A2A message saved to local SQLite Memory Core. | A2A message saved to local SQLite Memory Core. |
| **2. Unread/List State Correct** | `list_messages` confirms unread status. | `list_messages` confirms unread status. | `list_messages` confirms unread status. |
| **3. Subscription & Metadata** | Subscription active, `harnessTarget` is `bridge-daemon`, `appName` matches Claude. | Subscription active, `harnessTarget` is `bridge-daemon`, `appName` matches Antigravity. | Subscription active, `harnessTarget` is `bridge-daemon`, `appName` matches Codex. |
| **4. Wake Event Emitted** | Raw/coalesced event emitted with correct envelope shape. | Raw/coalesced event emitted with correct envelope shape. | Raw/coalesced event emitted with correct envelope shape. |
| **5. Adapter Selection** | Adapter strictly selects Claude session target. | Adapter strictly selects Antigravity/Gemini session target. | Adapter strictly selects Codex session target. |
| **6. Prompt Payload Lands** | Payload lands natively in Claude's prompt field. | Payload lands directly in the Antigravity Agent Composer. | Payload lands in Codex Desktop's prompt surface. |
| **7. No File Modification (Negative Assertion)** | N/A (or no stray pasting in other apps). | **MUST NOT** land in any active editor/file content (`git status` remains clean). | N/A (or no stray pasting). |
| **8. No Fresh Session Spawns (Negative Assertion)** | Must resume existing session unless explicit sunset state authorizes spawn. | Must resume existing session unless explicit sunset state authorizes spawn. | Must resume existing session unless explicit sunset state authorizes spawn. |
| **9. Prompt Submitted / Turn Starts** | Wake payload is submitted and starts/steers the agent turn without a human pressing Enter. | Wake payload is submitted and starts/steers the agent turn without a human pressing Enter. | Wake payload is submitted and starts/steers the agent turn without a human pressing Enter. |
| **10. Actionable Receipt** | Recipient can act on prompt or emit clear blocked signal. | Recipient can act on prompt or emit clear blocked signal. | Recipient can act on prompt or emit clear blocked signal. |
| **11. Evidence Artifact** | Manual or test log evidence captured in PR/comment. | Manual or test log evidence captured in PR/comment. | Manual or test log evidence captured in PR/comment. |

## Evidence Requirements

Due to the brittle nature of native UI automation across multiple different IDEs and proprietary desktop apps, **live/manual evidence is acceptable** for UI-only assertions (requirements 6-10).

However, deterministic headless unit/integration tests **MUST** be used to validate the backend and wake-daemon adapter intent (requirements 1-5).
