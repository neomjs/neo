# Neo.mjs AI SDK Manifest

This manifest defines the public API for the Neo.mjs AI Infrastructure SDK. Agents should read this file to discover available services and their method signatures before writing execution scripts.

**Import Path:** `ai/services.mjs` (Relative to project root)

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