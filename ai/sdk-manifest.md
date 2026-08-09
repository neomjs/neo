# Neo.mjs AI SDK Manifest

This manifest defines the public API for the Neo.mjs AI Infrastructure SDK. Agents should read this file to discover available services and their method signatures before writing execution scripts.

**Import Path — choose by the exports you need, NOT by where your process runs** (both paths relative to project root):

| exports your script needs | import from |
|---|---|
| only `GH_` · `GL_` · `NeuralLink_` · `Shared_` | **`ai/services.host.mjs`** |
| any `KB_` or `Memory_` | `ai/services.mjs` |

`ai/services.mjs` exports everything it always did, so **existing imports are unchanged and remain valid.**

**Why the axis is exports and not location.** The host barrel does not carry `KB_*` or `Memory_*` at all — importing them from it is a missing-export error, not a degraded mode. So "my script runs on the host, therefore I use the host barrel" is wrong whenever the script needs a Knowledge Base or Memory Core service.

**And if your host-side script does need `KB_` or `Memory_`, the friction is the point, not a packaging inconvenience.** Those services reach a durable store, and a host machine has only the base package tier — so importing the cloud root there can fail on packages that are simply absent. The barrel split makes that visible at the import instead of at runtime. Treat it as a design signal about where the work belongs, not as something to route around.

---

## 1. Knowledge Base (KB_)
**Domain:** Semantic search and documentation retrieval.

### KB_QueryService
- **`async queryDocuments({ query, type? })`**
  - `query` (String): Natural language query.
  - `type` (String, optional): Content type filter (`'all'`, `'guide'`, `'src'`, `'ticket'`).
  - **Returns:** `Promise<{ topResult: String, results: Array<{source, score}> }>`

### KB_LifecycleService
- **`async ready()`**: Resolves when the DB process is ready.
- **`async startDatabase()`**
- **`async stopDatabase()`**

### KB_DatabaseService
- **`async ready()`**: Resolves when the KB content is synchronized.
- **`async syncDatabase()`**: Full re-index (expensive).
- **`async createKnowledgeBase()`**: Generates JSONL.
- **`async embedKnowledgeBase()`**: Generates vectors.

### KB_DocumentService
- **`async getDocumentById({ id })`**
- **`async listDocuments({ limit, offset })`**

### KB_HealthService
- **`async healthcheck()`**: Returns `{ status: 'healthy'|'unhealthy', details: [] }`.

---

## 2. Memory Core (Memory_)
**Domain:** Long-term agent memory and session management.

### Memory_Service
- **`async addMemory({ prompt, response, thought, sessionId? })`**
  - Stores an interaction. `sessionId` defaults to current session.
- **`async queryMemories({ query, nResults, sessionId? })`**
  - Semantic search over past interactions.
- **`async listMemories({ sessionId, limit, offset })`**

### Memory_SessionService
- **`async summarizeSessions({ sessionId? })`**
  - Triggers LLM summarization of session history.
- **`async findUnsummarizedSessions()`**

### Memory_LifecycleService
- **`async ready()`**: Resolves when Memory DB is ready.
- **`async startDatabase()`**
- **`async stopDatabase()`**

---

## 3. GitHub Workflow (GH_)
**Domain:** Repository management, issues, and PRs.

### GH_IssueService
- **`async createIssue({ title, body, labels?, assignees? })`**
  - **Returns:** `{ issueNumber, url }`
- **`async listIssues({ limit, state?, labels?, assignee? })`**
- **`async createComment({ issue_number, pr_number, body, agent })`**
- **`async addLabels(issueNumber, labels)`**
- **`async removeLabels(issueNumber, labels)`**
- **`async assignIssue({ issue_number, assignees })`**
- **`async updateIssueRelationship({ relationship_type, child_issue, parent_issue })`**

### GH_PullRequestService
- **`async listPullRequests({ limit, state? })`**
- **`async getPullRequestDiff({ pr_number })`**
- **`async getConversation({ pr_number })`**
- **`async checkoutPullRequest({ pr_number })`**

### GH_RepositoryService
- **`async listLabels()`**
- **`async getViewerPermission()`**

---

## Example: "Self-Healing" Script

```javascript
import { KB_QueryService, GH_IssueService, KB_LifecycleService } from './ai/services.mjs';

async function main() {
    // 1. Initialize
    await KB_LifecycleService.ready();

    // 2. Get Issue Context
    const issues = await GH_IssueService.listIssues({ labels: 'bug', limit: 1 });
    const bug = issues.issues[0];

    // 3. Search for Solution
    const docs = await KB_QueryService.queryDocuments({ query: bug.title });

    console.log(`Analyzing bug #${bug.number} with context: ${docs.topResult}`);
}

main();
```