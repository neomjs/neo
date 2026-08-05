# Troubleshooting Tool Calls

As an AI agent, using tools effectively is a core part of your function. However, you may encounter situations where tool calls fail for non-obvious reasons. This guide provides a framework for troubleshooting these issues.

## The Golden Rule: Don't Give Up on First Failure

A failed tool call is not a dead end. It is a valuable piece of information. Your primary goal should be to use the failure as a clue to find the correct way to call the tool.

## The Scientific Method for Tool Calls

Treat every tool call as a mini-experiment.

1.  **Formulate a Hypothesis:** Based on the tool's name, its server, and any known naming conventions, form a hypothesis about the correct function name and parameters.

2.  **Run the Experiment:** Execute the tool call.

3.  **Analyze the Results:**
    *   **Success:** Your hypothesis was correct.
    *   **Failure:** Your hypothesis was incorrect. Analyze the error message carefully. It is your most important clue.

4.  **Refine and Repeat:** Use the error message and any other available data (e.g., a list of available tools) to formulate a new, more informed hypothesis. Repeat the process.

## Common Pitfall: Naming Conventions

A common source of errors is the naming convention for tools, especially in a multi-server environment.

### The Disambiguation Prefix

You may have learned a rule for disambiguating tool names that share the same name across different servers, such as prefixing the tool with the server name (e.g., `serverName__toolName`).

**Example:** `healthcheck` is a common tool name. To call it on the `github-workflow` server, you might use `neo_mjs_github_workflow__healthcheck()`.

### The Over-generalization Trap

The most critical mistake is to over-generalize this rule. **Do not assume that all tools on a server require a prefix.**

Some tools may have names that are unique across all servers. Harnesses can still expose those names differently, so the live tool list—not a remembered prefix rule—is authoritative.

**Example:**
*   `healthcheck` (ambiguous) -> requires `neo_mjs_github_workflow__healthcheck()`
*   `get_pull_request_diff` (unique) -> call the exact name advertised by the current tool surface

If a remembered tool name fails, inspect the current tool surface before retrying; do not synthesize alternate names from stale guidance.

## When the error message is the wrong clue: a stale tool schema

The Scientific Method above says the error message is your most important clue. There is one failure
where it points the wrong way, and it is worth naming because the wrong conclusion gets published as
fact.

Your client caches each server's tool schemas **at connect** and never revalidates. Every Neo server
declares `tools: {listChanged: false}`, so no refresh signal will ever arrive. If a capability shipped
after you attached, your client rejects the call *before it leaves* — and the rejection quotes your own
cached schema as if it were the server's:

```
MCP error -32602: Invalid arguments for tool manage_wake_subscription:
  "values": ["bootstrap","subscribe","unsubscribe","update","list","resync"]
```

Read literally, that says the server does not support the action. It says no such thing. It says *your
copy* does not. Three wrong moves follow: reporting the capability as absent, building a workaround for
something that already shipped, or filing a bug against a working server.

**Reading your own tool list does not help** — it is the same cache.

### The comparison

`healthcheck` carries both halves, and you need no new call beyond the one you were going to make:

| where | what it is |
|---|---|
| the `healthcheck` **description** you hold | `Advertised-surface digest at attach: <token>` — frozen into your cache when you attached |
| the `healthcheck` **result** | `advertisedSurface.digest` — computed by the server on this call |

| tokens | verdict | what to do |
|---|---|---|
| equal | `current` | Your schema matches what this server advertises. An absence really is an absence. |
| different | `stale` | Reconnect before asserting anything about capability. Do not report a capability as missing. |
| either absent | **`unknown`** | The comparison did not happen. **Never read this as `current`** — a server predating the instrument looks exactly like this, and so does a page that did not contain `healthcheck`. |

Equality claims one thing only: this attachment was provisioned from the same advertised-surface
generation the server serves now. It says nothing about host-side truncation or paging, which no
server-side value can see.

The digest covers tool **names and input schemas** for the projection you were served. Descriptions are
excluded, so a reworded description does not move it — the axis is whether a capability is *reachable*,
not whether its prose is current.

**The rule this exists to enforce:** an absence-claim about a capability requires a `current` verdict.
Without one, the honest statement is *"my schema may predate it"*, not *"it does not exist"*.

## Conclusion

Flexibility and a systematic, evidence-based approach are key. Do not rigidly adhere to a rule that has been proven false by an experiment. Use every success and failure to build a more accurate mental model of the tool environment.
