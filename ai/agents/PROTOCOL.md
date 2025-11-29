# Neo.mjs Agent Task Protocol v1.0

This document defines the strict communication contract ("The Law") for autonomous agents operating within the Neo.mjs ecosystem. It ensures that a swarm of specialized agents (Strategic, Tactical, Execution) can coordinate asynchronously across different repositories without chaos.

## 1. The Philosophy: GitHub as the Bus

We use GitHub Issues as a persistent, asynchronous message bus.
*   **Issues** are Tasks.
*   **Labels** are State.
*   **Comments** are the Audit Trail.

## 2. Label Schema (The State Machine)

Agents MUST respect and enforce these labels. A task can only be in one primary state at a time.

| Label | Meaning | Actor |
| :--- | :--- | :--- |
| `agent-task:pending` | The task is defined and queued. Waiting for a worker. | PM / Human |
| `agent-task:in-progress` | A worker has claimed the task. | Worker Agent |
| `agent-task:review` | Work is done (PR linked). Waiting for verification. | Worker Agent |
| `agent-task:blocked` | Agent is stuck/derailed. Needs human intervention. | Worker Agent |
| `agent-task:completed` | Task is verified and closed. | Human / QA Agent |

### Role Labels
| Label | Meaning |
| :--- | :--- |
| `agent-role:pm` | Strategic/Tactical task (Breakdown, Planning). |
| `agent-role:dev` | Execution task (Coding, Testing). |
| `agent-role:qa` | Verification task. |

### Attribute Labels
| Label | Meaning |
| :--- | :--- |
| `ai-generated` | Created by an AI agent (for filtering). |
| `repo:middleware` | (Optional) Hints that this task belongs to a satellite repo. |

## 3. Issue Templates (The Contract)

Agents MUST parse and generate Issue Bodies using these strict YAML structures.

### A. Epic -> Ticket Handoff (PM to Dev)
When a PM Agent breaks down an Epic, it creates tickets with this body:

```yaml
# AGENT TASK CONTRACT
version: 1.0
type: implementation
role: dev

goal: >
  Implement the "Dark Mode Toggle" in the MainView.

context:
  epic_issue: 123
  files:
    - "src/view/Main.mjs"
    - "resources/scss/theme-dark.scss"
  knowledge_base_refs:
    - "learn/guides/styling/Theming.md"

requirements:
  - "Must use CSS variables for colors."
  - "Must persist state to LocalStorage."
  - "Must include a unit test."
```

### B. Ticket -> PR Handoff (Dev to Review)
When a Dev Agent finishes work, it posts a comment and updates the issue:

```yaml
# AGENT RESULT CONTRACT
status: success
pr_url: "https://github.com/neomjs/neo/pull/456"
files_modified:
  - "src/view/Main.mjs"
test_results: "Passed (3/3)"
```

### C. Derailment Report (Blocked)
If an agent fails 3 times or hits a critical error:

```yaml
# AGENT ERROR REPORT
status: blocked
reason: "Test failure loop"
error_log: |
  Error: Element not found #my-button
  at test/spec/Main.mjs:20
attempts: 3
request: "Please clarify the selector for the toggle button."
```

## 4. Lifecycle Rules

### 4.1 Claiming a Task
1.  **Scan:** Agent queries `state:open label:agent-task:pending`.
2.  **Lock:** Agent adds `agent-task:in-progress` and removes `agent-task:pending`.
3.  **Assign:** Agent adds itself (if applicable) or a bot user to "Assignees".

### 4.2 Execution Loop
1.  **Read:** Parse the YAML body.
2.  **Context:** Load the `context.files`.
3.  **Act:** Modify code.
4.  **Verify:** Run tests.
    *   *Pass:* Goto Step 5.
    *   *Fail:* Retry (max 3 times).
    *   *Fail x3:* Label `agent-task:blocked`, post Error Report. Exit.
5.  **Deliver:** Create PR, label `agent-task:review`, post Result Contract.

### 4.3 Cross-Repo Coordination
For Satellite Repos (e.g., `middleware`):
*   If an agent in `neo` creates a task for `middleware`, it MUST use the `repository` field in the GitHub tool.
*   It SHOULD add a label like `project:middleware` to the original Epic for visibility.

## 5. Safety & Permissions
*   Agents **NEVER** push directly to `main` or `master`.
*   Agents **ALWAYS** create a branch `feat/issue-{id}`.
*   Agents **NEVER** delete files unless explicitly instructed in `requirements`.
