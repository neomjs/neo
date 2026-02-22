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

### Graceful Degradation & Backoff
If a request fails with a `5xx` (Server Error) or `403` (Forbidden), the service automatically initiates an exponential backoff retry loop.

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

This logic specifically distinguishes between running out of quota (a hard stop) and triggering GitHub's secondary abuse detection (which requires a temporary pause to cool down).

---

## 4. The Rename Problem: Database ID Resolution

A significant challenge in tracking developers over time is that GitHub usernames (`login`) can change. If a tracked user renames their account, their old login will return a `404 NOT_FOUND` or `Could not resolve to a User` error.

To prevent data loss and ensure continuity, the `GitHub` service provides specific methods to resolve immutable IDs back to their current logins.

### `getLoginByDatabaseId(dbId)`
GitHub assigns every user an immutable integer `databaseId`. If a username lookup fails, the DevIndex pipeline can call this method using the stored `databaseId` to fetch the new, updated username.

```javascript
const query = `
    query { 
        user(databaseId: ${dbId}) {
            login
        } 
    }`;
```

### `getLoginById(nodeId)`
Similarly, GitHub uses global Base64 `nodeId`s. This method uses the polymorphic `node` interface to resolve a Node ID back to a User or Organization login.

These resolution methods are critical for the data hygiene maintained by the `Cleanup` service, ensuring that renames are handled gracefully rather than treating the user as deleted.