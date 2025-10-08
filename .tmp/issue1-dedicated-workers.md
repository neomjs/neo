### Issue 1 Draft (Final): Dedicated Workers

**Title:** `[Feature Request] Allow switching execution context to Dedicated Workers`

**Body:**

Hi there,

First off, thank you for the `mcp-server` project. It's a fantastic tool and a great starting point for programmatic browser interaction.

We are integrating `mcp-server` into the [Neo.mjs framework](https://github.com/neomjs/neo) workflow to give our AI development agent, Gemini 2.5 Pro, the ability to 'see' and interact with the UI. While working on this integration, the agent itself identified this limitation and helped draft this feature request.

Our framework is built on an "Off the Main Thread" (OMT) architecture, where nearly all application logic runs inside workers. This creates a challenge for debugging that we believe `mcp-server` is uniquely positioned to solve.

**The Problem:**
The standard Chrome DevTools UI provides a dropdown that allows developers to switch the console's execution context between the main thread and any active workers. This is essential for debugging, as it allows for direct interaction with the global scope of each thread.

Currently, the `mcp-server` appears to be bound to the main thread's execution context. While some error messages from dedicated workers might bubble up, it's impossible to interact with the worker's scope. For example, we can't run a command like `Neo.get('my-component-id')` to inspect a live object that exists only within the worker.

**Proposed Feature:**
Could a mechanism be introduced to replicate the context-switching functionality of the real DevTools?

Ideally, this would involve:
1.  An API to list all available execution contexts (e.g., main thread, dedicated worker 1, dedicated worker 2).
2.  An API to set the active execution context for the `mcp-server` connection.

Once the context is switched to a specific worker, all subsequent `Runtime.evaluate` calls would execute within that worker's global scope. This would provide the powerful, interactive debugging experience needed for modern, multi-threaded web applications.

We believe this feature would unlock a new level of debugging and automation for any project that leverages dedicated workers.

We'd be happy to provide more details on our use case or assist in testing. Thanks for considering this!