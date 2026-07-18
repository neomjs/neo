# The GitHub API Client

The **GitHub Service** ([`DevIndex.services.GitHub`](https://github.com/neomjs/neo/blob/dev/apps/devindex/services/GitHub.mjs)) abstracts the complexity of communicating with GitHub. It provides a unified, resilient interface for both GraphQL and REST queries, managing authentication, rate limiting, and complex error handling autonomously.

---

## 1. Authentication & Token Resolution

The service implements a smart token resolution strategy (`#getAuthToken`), prioritizing environment variables for CI/CD pipelines while providing a seamless fallback for local development.

1.  **Environment Variables:** It first checks `GH_TOKEN` and `GITHUB_TOKEN`.
2.  **CLI Fallback:** If no environment variable is found, it automatically executes `gh auth token` via `child_process`. This allows developers to run the backend locally without manually managing `.env` files, relying entirely on their secure GitHub CLI session.

---

## 2. Hybrid Protocol Architecture

The DevIndex requires both deep, structured data and broad, shallow data. The GitHub service supports both protocols natively.

### GraphQL (`query`)
*   **Use Case:** The primary engine. Used by the Updater to fetch multi-year contribution graphs in a single Round Trip Time (RTT), and by the Spider to traverse complex social graphs (e.g., "followers of followers").
*   **Advantage:** Drastically reduces API calls and payload sizes by requesting exactly the data needed.

### REST (`rest`)
*   **Use Case:** Used for endpoints where GraphQL is either unsupported or overly complex (e.g., checking raw repository existence, specific organization details).
*   **Advantage:** Simpler for basic existence checks.

---

## 3. Advanced Rate Limit & Abuse Handling

GitHub's API enforces strict rate limits (typically 5,000 points per hour for GraphQL) and secondary abuse detection mechanisms. The `GitHub` service is designed to be highly resilient against these constraints.

### Header & Body Parsing
The service tracks rate limits across multiple "buckets" (`core`, `search`, `graphql`). It updates its internal state dynamically by parsing the `x-ratelimit-*` headers attached to every response.

For GraphQL, it also hooks into the `rateLimit` object returned within the JSON body, which provides the most accurate reflection of the complex query costs.

### GraphQL Backoff
GraphQL requests retain their existing bounded retry policy for server failures and `403` responses. A `403` with quota remaining is treated as secondary abuse detection and receives a longer cooldown; a depleted quota remains visible through the tracked `graphql` bucket.

```javascript
if ((response.status >= 500 || response.status === 403) && retries > 0) {
    let delay = (4 - retries) * 2000; // Default: 2s, 4s, 6s

    // Secondary Rate Limit (Abuse Detection) Handling
    if (response.status === 403) {
        const bucket = this.rateLimit.graphql;
        // If we have quota remaining but get a 403, it's an abuse trigger.
        if (bucket.remaining > 0) {
            delay = 10000; // 10s penalty box
        }
    }
    // ... retry
}
```

This path is GraphQL-specific. Its caller-supplied retry budget and secondary-abuse handling should not be confused with the independently configurable REST policy.

### GraphQL Transient Retry & the Read/Mutation Boundary
Beyond the server-failure/`403` policy above, the GraphQL path also retries **transient** failures — transport disconnects and GitHub's intermittent 200-body API errors (e.g. `Resource not accessible by integration`) — classified from the same shared `retryableTransientErrorPatterns` source of truth the REST path uses, so the two transports cannot drift into separate hand-maintained lists. Backoff uses the shared `restRetryBaseDelayMs` / `restRetryMaxDelayMs` / `restRetryJitterRatio` configs; their legacy REST-prefixed names remain stable for operator compatibility even though both transports now consume them.

Retry **classification** (is the failure transient?) and retry **authorization** (is replay safe?) are separate decisions. A GraphQL `query` is idempotent by spec and safe to replay; a `mutation` is not. A transport disconnect leaves a mutation's server-side outcome unknowable, and a 200-body GraphQL response can carry partial `data` beside `errors` after mutation effects have applied. Mutations therefore fail loud rather than replay on either transient path; idempotent reads retain the bounded retry.

### REST Backoff
REST requests retry only bounded transport failures. The default retryable statuses are `429`, `502`, `503`, and `504`; recognized fetch/network failures such as connection resets and timeouts use the same attempt budget. Operators can override the policy through the service's Neo configs:

- `restMaxRetryAttempts`
- `restRetryBaseDelayMs` *(shared with the GraphQL transient retry; legacy name retained)*
- `restRetryMaxDelayMs` *(shared with the GraphQL transient retry; legacy name retained)*
- `restRetryJitterRatio` *(shared with the GraphQL transient retry; legacy name retained)*
- `restRetryableHttpStatuses`

When GitHub supplies `Retry-After`, the service honors either its numeric-seconds or HTTP-date form. Otherwise it uses capped exponential delay plus jitter. Every HTTP response updates the relevant `x-ratelimit-*` bucket before the service decides whether to retry.

The fail-closed boundary remains explicit: `403` marks the core quota as depleted and fails immediately, while `404` and other non-transient client errors are not retried. An exhausted transient HTTP response preserves the `REST Error: <status> <statusText>` contract; an exhausted network failure rethrows its original error object. Successful response bodies are part of the transport boundary, so a terminated body stream can retry, but malformed JSON remains a fail-fast parse error.

---

## 4. The Rename Problem: Database ID Resolution

A significant challenge in tracking developers over time is that GitHub usernames (`login`) can change. If a tracked user renames their account, their old login will return a `404 NOT_FOUND` or `Could not resolve to a User` error.

To prevent data loss and ensure continuity, the `GitHub` service provides specific methods to resolve immutable IDs back to their current logins.

### `getLoginByDatabaseId(dbId)`
GitHub assigns every user an immutable integer `databaseId`. If a username lookup fails, the DevIndex pipeline can call this method using the stored `databaseId` to fetch the new, updated username.

```javascript
const account = await GitHub.rest(`user/${dbId}`, `DB_ID:${dbId}`);
const login   = account?.login ?? null;
```

Database-ID resolution is REST-owned because GitHub exposes the immutable integer lookup at `/user/{account_id}`. A `404` means the account cannot be resolved and becomes `null` at the resolver boundary; exhausted transient transport failures continue to throw so the Cleanup pipeline cannot misclassify an upstream outage as account deletion.

### `getLoginById(nodeId)`
Similarly, GitHub uses global Base64 `nodeId`s. This method uses the polymorphic `node` interface to resolve a Node ID back to a User or Organization login.

These resolution methods are critical for the data hygiene maintained by the `Cleanup` service, ensuring that renames are handled gracefully rather than treating the user as deleted.
