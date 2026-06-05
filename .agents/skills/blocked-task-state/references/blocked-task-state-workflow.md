# Blocked Task-State Coordination Protocol

This document codifies the Swarm's authoritative pattern for signaling that an agent is blocked but not completed (`InputRequired`, `Blocked`, or `Failed`).

The swarm relies natively on the A2A v1.0 `Task.state` at the message-level to signal transitions when an agent is genuinely blocked. We do NOT use continuous-presence polling or global "idle" capacity broadcasts.

## 1. Targeted Ping Mandate (AC1)

Blocked-task transitions (`InputRequired`, `Blocked`, `Failed`) MUST trigger a targeted ping to the specific task-assignee and the human operator.
- You MUST NOT send a global `AGENT:*` broadcast.
- Global broadcasts for routine tasks are explicitly banned to prevent mailbox spam.

## 2. A2A Task Envelope Integration (AC2)

The blocked signal MUST map exactly to the native A2A `Task.state` field within the existing `add_message` task envelope.

Example `add_message` invocation:
```javascript
{
  "to": "@neo-opus-ada", // Targeted explicitly
  "subject": "Task Blocked: #10761 API rate limit",
  "body": "I am blocked on issue #10761 due to an API rate limit...",
  "task": {
    "taskId": "10761",
    "state": "Blocked" // MUST be one of: InputRequired, Blocked, Failed
  }
}
```
*(Note: A2A Protocol states are PascalCase per specification: `InputRequired`, `Blocked`, `Failed`)*

## 3. Negative Examples (When NOT to trigger) (AC3)

You MUST NOT trigger the blocked task-state pattern for the following routine events. These do NOT represent a blocked state:
- **Ordinary PR comments:** Regular back-and-forth review feedback.
- **Routine approvals:** Signaling that a PR looks good to me (LGTM).
- **Completed merge eligibility:** A PR has all approvals and is waiting for the human merge gate.
- **General availability:** Broadcasting that you have finished your current assignment and have free capacity. Idle/Capacity advertisement is strictly forbidden.

## 4. Payload Schema Constraints (AC4)

When sending the blocked-task A2A message, the `body` content MUST strictly contain the following constrained payload:

- **Task/Issue ID:** Explicit reference to the GitHub issue or PR number.
- **Prior State:** The execution state before becoming blocked (e.g., `Working`, `Submitted`).
- **New State:** The explicit blocked transition (`InputRequired`, `Blocked`, `Failed`).
- **Blocker Summary:** A concise, 1-2 sentence description of the blocker.
- **Exact Requested Input:** Explicitly state what you need from the recipient to unblock (e.g., "Need approval for architectural shift", "Need updated API key").
- **Current Owner:** The agent currently assigned to the ticket.
- **Target Recipient:** The peer or operator who can resolve the blocker.
- **Retry/Expiry Guidance:** Explicit rules for when you will retry or when the request expires (e.g., "Will wait 24h before dropping context").
- **Public Artifact Link:** A URL to the relevant GitHub Issue/PR or a local workspace artifact path detailing the blocker.

Example Payload in `body`:
```markdown
- **Task ID:** #10761
- **Prior State:** Working
- **New State:** Blocked
- **Blocker Summary:** The embedding model endpoint is returning 400 errors for Qwen3-8b.
- **Exact Requested Input:** @tobiu please verify if the local model needs to be re-pulled.
- **Current Owner:** @neo-gemini-pro
- **Target Recipient:** @tobiu
- **Retry/Expiry Guidance:** Will drop context after 24h.
- **Public Artifact Link:** https://github.com/neomjs/neo/issues/10761
```
