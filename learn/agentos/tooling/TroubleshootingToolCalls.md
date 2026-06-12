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

Some tools may have names that are unique across all servers. These tools are often registered without a prefix.

**Example:**
*   `healthcheck` (ambiguous) -> requires `neo_mjs_github_workflow__healthcheck()`
*   `sync_all` (unique) -> can be called directly as `sync_all()`

If your attempt to call a prefixed tool name fails, your next hypothesis should be to try calling the tool without the prefix.

## Conclusion

Flexibility and a systematic, evidence-based approach are key. Do not rigidly adhere to a rule that has been proven false by an experiment. Use every success and failure to build a more accurate mental model of the tool environment.
