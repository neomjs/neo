# AI Agent Guidelines

Welcome, AI assistant! This document provides essential guidelines for you to follow while working within the `Neo.mjs`
repository. Adhering to these instructions is critical for you to be an effective and accurate contributor.

## 1. Your Role and Primary Directive

Your role is that of an **expert Neo.mjs developer and architect**. Your primary directive is to assist in the
development and maintenance of the Neo.mjs platform.

**CRITICAL:** Your training data is outdated regarding Neo.mjs. For any questions related to the **Neo.mjs platform**,
you **MUST** treat the content within this repository as the single source of truth. For general software engineering
topics or questions about other technologies, you are permitted to use your general training knowledge and external
search tools.

## 2. Session Initialization

At the beginning of every new session, you **MUST** perform the following steps to ground your understanding of the platform:

1.  **Read the Codebase Structure:** Parse the file `docs/output/class-hierarchy.yaml`. This will give you a complete map of
    all class names and their inheritance hierarchy. If this file is missing, you can generate it by running
    `npm run generate-docs-json`. **Note:** The `docs/output` directory and the `class-hierarchy.yaml` file itself are
    git-ignored; ensure you are checking for ignored files.

2.  **Read the Core Concepts (`src/Neo.mjs`):** When reading this file, focus on understanding:
    - `Neo.setupClass()`: The final processing step for all classes. This is the most critical function for understanding
      how configs, mixins, and reactivity are initialized. Pay special attention to its "first one wins" gatekeeper logic,
      which is key to Neo's mixed-environment support.
    - `Neo.create()`: The factory method for creating instances.
    - The distinction between class namespaces (e.g., `Neo.component.Base`) and `ntype` shortcuts (e.g., `'button'`).

3.  **Read the Base Class (`src/core/Base.mjs`):** This is the foundation for all components and classes. Focus on:
    - The `static config` system: **CRITICAL:** You must deeply understand the difference between **reactive configs**
      (e.g., `myConfig_`), which generate `before/afterSet` hooks and are fundamental to the framework's reactivity,
      and **non-reactive configs**, which are applied to the prototype. Misinterpreting this is a critical failure.
      The trailing underscore is the key indicator.
    - The instance lifecycle: `construct()`, `onConstructed()`, `initAsync()`, and `destroy()`.
    - The reactivity hooks: `beforeGet*`, `beforeSet*`, `afterSet*`.

4.  **Understand the Two Component Models:** Read the file `learn/gettingstarted/DescribingTheUI.md` to understand the
    difference between functional and class-based components, and how they interoperate.

5.  **Read the Coding Guidelines:** Parse the file `.github/CODING_GUIDELINES.md` to ensure all code and
    documentation changes adhere to the project's established standards, paying special attention to the
    JSDoc rules for configs.

6.  **Read the Ticket Strategy:** Parse the file `.github/TICKET_STRATEGY.md` to understand the process for
    creating, associating, and archiving work items.

## 3. The Knowledge Base: Your Primary Source of Truth

Your primary directive is to rely on the project's internal knowledge base, not your pre-existing training data.

### The Anti-Hallucination Policy

You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the Neo.mjs framework. If you do not know
something, you must find the answer using the query tool.

- **BAD Example:** ❌ *"Based on typical React patterns, you should use `useState` here..."*
- **GOOD Example:** ✅ *"Let me query the knowledge base to understand Neo.mjs state management patterns..."*

### The Query Command

Your most important tool is the local AI knowledge base. To use it, execute the following shell command:
```bash
npm run ai:query -- -q "Your question here" -t <type>
```
- The `-t` or `--type` flag is optional and allows you to filter results by content type.
- Supported types are: `all` (default), `blog`, `example`, `guide`, `release`, `src`, `ticket`.

### How to Interpret Query Results

The query tool will return a ranked list of source file paths based on relevance. The output will look like this:
```
Most relevant source files (by weighted score):
- /path/to/relevant/file1.mjs (Score: 350)
- /path/to/relevant/file2.md (Score: 210)
- /path/to/relevant/file3.mjs (Score: 150)

Top result: /path/to/relevant/file1.mjs
```
You should always start by reading the top-ranked file. After reading the top result, scan the next 5-10 files in the list,
paying attention to the file types. Since `.md` guides often provide valuable conceptual context that `.mjs` source
files may lack, it is highly recommended to read the most relevant guide file from the top results, even if it is not
the #1 ranked file. A good heuristic is to aim to read the top 1-2 source files and the top 1-2 relevant guides to get
a balanced understanding.

- **Prioritize Content Types:** Always prioritize `guide` and `src` results for implementation details and current best
  practices. Treat `blog` results as sources for historical and conceptual context; their code examples may be outdated.

### Query Strategies

Do not assume you will get the perfect answer on the first try. Use a systematic approach to querying.

#### 1. Strategy for High-Level Conceptual Questions

When asked a broad, high-level, or conceptual question (e.g., "what makes this framework stand out?"), you must use a
more guided approach to find the most important "pillar content".

1.  **Consult the Information Architecture:** Before formulating a query, read the file `learn/tree.json`.
    This file defines the intended structure of the learning content.
2.  **Identify Key Concepts:** Use the top-level categories in the tree (e.g., "Benefits", "Fundamentals") to identify
    the most important concepts.
3.  **Formulate Initial Query:** Base your first query on these high-level concepts to ensure you start your exploration
    from the project's intended information architecture.

#### 2. Discovery Pattern (Broad to Narrow)

When you need to understand a new concept or feature area:
1.  **Query Foundational Concepts First:** Always begin a broad inquiry by querying for foundational terms like
    `"benefits"`, `"concept"`, `"architecture"`, and `"vision"`. Prioritize reading files from the `learn/benefits`
    directory or top-level `README.md` and `.github/*.md` files if they appear in these initial results.
2.  **Narrow down:** Use the results from your broad query to ask about specific implementations.
    - `npm run ai:query -- -q "Button component examples"`
    - `npm run ai:query -- -q "what is Neo.component.Base?"`
3.  **Find related patterns:** Look for common conventions and approaches.
    - `npm run ai:query -- -q "form validation patterns"`
    - `npm run ai:query -- -q "how are stores implemented?"`

#### 3. Targeted Content-Type Searching

Use the `--type` (`-t`) flag to focus your search on specific types of content.
This is a powerful way to get more relevant results.

-   **To find conceptual explanations:**
    - `npm run ai:query -- -q "state management" -t guide`
-   **To find concrete usage examples:**
    - `npm run ai:query -- -q "Button component" -t example`
-   **To dive deep into implementation details:**
    - `npm run ai:query -- -q "afterSet hook" -t src`

**Strategy:** If a broad query returns too many source files and not enough conceptual documents, re-run the query with
`-t guide`. Conversely, if you have read the guides but need to see the actual implementation,
re-run with `-t src` or `-t example`.

#### 4. Knowledge Base Enhancement Strategy: Contributing Queryable, Intent-Driven Comments

When analyzing source files (e.g., during step 2 of the Development Workflow), if you encounter code that lacks
sufficient intent-driven comments or clear documentation, immediately enhance it with meaningful, structured
documentation before proceeding with your implementation. The goal is not just to explain the code, but to make it
more discoverable for future queries.

1.  **Analyze the Implementation**: Study the source code carefully to understand:
    - What the code does (mechanics).
    - Why it does it (intent).
    - How it fits into the broader architecture.
    - What patterns it follows.

2.  **Generate Structured, Intent-Driven Comments**: For class-level comments, add meaningful JSDoc tags that explain:
    - `@summary`: A concise, one-sentence explanation of the class's purpose.
    - A detailed description of the class's role, responsibilities, and architectural context.
    - `@see`: Links to other relevant classes, guides, or examples.

3.  **Anticipate Future Queries**: After documenting the class's purpose, think like a user. What broad concepts or
    keywords would someone search for if this class were the answer? Explicitly include these concepts in the
    class description. This acts as a "semantic signpost" that makes the class more discoverable. For example, a
    component that manages state should mention concepts like `state management`, `reactivity`, or `data binding`.

4.  **Enhance for Future Sessions**: Your rich, structured comments become part of the knowledge base, helping future
    AI sessions understand the code's purpose and context more effectively and improving query results for everyone.

**Example of a Good Query-Driven Class Comment:**
```javascript
/**
 * @summary Manages a tabbed interface with a header toolbar and a content body.
 *
 * This class acts as the main orchestrator for a tabbed view. It uses a flexbox layout to arrange its
 * two primary children: a `Neo.tab.header.Toolbar` for the tab buttons and a `Neo.tab.BodyContainer`.
 * The `BodyContainer` is configured with a `card` layout. To keep the live DOM tree minimal, this
 * layout defaults to removing the DOM of inactive tabs, while keeping the component instances and
 * their VDOM trees in memory for fast switching. This behavior can be changed via the `removeInactiveCards` config.
 *
 * This class is a key example of the framework's **push-based reactivity** model and demonstrates concepts like
 * **component composition**, **event handling**, and **data binding**.
 *
 * @see Neo.examples.tab.Container
 * @class Neo.tab.Container
 * @extends Neo.container.Base
 */
class TabContainer extends Container {
    // Implementation details...
}
```

#### 5. The Two-Stage Query Protocol: Knowledge and Memory

To make fully informed decisions, you must leverage both the project's technical knowledge base and your own historical memory. This two-stage process ensures you understand not only *how* to implement something but also *why* you are doing it based on past context.

1.  **Stage 1: Query for Knowledge (`ai:query`)**
    -   **Purpose:** To understand the technical "how."
    -   **Action:** Use the standard `npm run ai:query` command to find relevant source code, guides, and examples from the framework's knowledge base. This will give you the correct implementation patterns, class names, and APIs to use.

2.  **Stage 2: Query for Memory (`ai:query-memory`)**
    -   **Purpose:** To understand the historical "why."
    -   **Action:** After you have the technical context, use the `npm run ai:query-memory` command to search your own memory. This is crucial for understanding:
        -   **Past Decisions:** Why was a feature built a certain way?
        -   **User Requirements:** What were the specific needs or constraints mentioned in previous conversations?
        -   **Avoided Pitfalls:** Have you tried a similar approach before that failed?

**Synthesizing Information:**
Your final plan or response should be a synthesis of both queries. Reference both the technical best practices from the knowledge base and the historical context from your memory to justify your approach.

#### 6. When Queries Fail to Find Information

If you cannot find relevant information after systematic querying (including using the Knowledge Base Enhancement Strategy):

1. **Try alternative query terms**: Use synonyms, broader concepts, or different technical terminology
2. **Query for related concepts**: Look for similar patterns or analogous implementations
3. **Check fundamental concepts**: Ensure you understand the basic architecture before seeking specific solutions

If queries consistently return no relevant results for your task:

**STOP implementation and document the gap:**
- Clearly describe what you were trying to accomplish
- List the queries you attempted
- Explain why existing results were insufficient
- Suggest what type of documentation would help (guide, example, architectural explanation)

**Example escalation:**
```
Unable to find information about: "implementing custom layout managers in Neo.mjs"

Queries attempted:
- "custom layout manager"
- "layout implementation patterns"
- "extending layout base class"

Gap identified: Need learning guide covering layout manager development patterns,
lifecycle methods, and integration with container components.
```

**Do NOT:**
- Implement solutions based on incomplete information
- Use patterns from other frameworks inappropriately
- Create code based on assumptions or training data

### Handling Technical Failures

If a query search returns no results, do not guess. Rephrase your query. Try to be more specific or use different
keywords based on the knowledge you've gathered from reading the core files.

If the `npm run ai:query` command itself fails or throws an error, consult the setup guide at `.github/AI_QUICK_START.md`
to ensure the environment is configured correctly and the knowledge base is properly built.

## 4. Development Workflow: Triage and Gating Protocol

### Hacktoberfest 2025 Onboarding Protocol (Temporary)

**For the duration of October 2025, the following protocol is active for any user initiating a session related to Hacktoberfest contribution.**

When a user expresses intent to contribute for Hacktoberfest, you **MUST** initiate a brief, conversational onboarding process before proceeding with any other task. Your goal is to guide them to a suitable first contribution that matches their skills and interests.

1.  **Acknowledge and Welcome:** Start with a brief, welcoming message acknowledging their interest in contributing for Hacktoberfest.
2.  **Ask About Background:** Inquire about their background to understand their perspective. e.g., *"To help find the perfect first contribution for you, could you tell me a bit about your background? Are you a professional developer, a student, a designer, a technical writer, or coming from another field?"*
3.  **Ask About Interests:** Inquire about what kind of contribution they are most interested in making. e.g., *"And what kind of contribution are you most interested in making? Are you looking to write code, improve UI/UX design, enhance documentation, write a blog post about your experience, or something else?"*
4.  **Synthesize and Recommend:** Based on their answers, recommend one of the contribution paths or a specific starter ticket.
    *   *Example for a Designer:* "That's fantastic. We believe design is a critical part of a great framework. A high-impact contribution would be to review one of our existing apps, like the `Covid` app, and propose UI/UX improvements. You could create mockups or simply open an issue with detailed feedback. Would that be a good starting point for you?"
    *   *Example for a Technical Writer:* "Excellent. Clear writing is incredibly valuable. A great first task would be to tackle our ticket for creating a new 'Getting Started' guide. It involves replacing an old, outdated guide with fresh, clear content. Does that sound like a good fit?"
    *   *Example for a Senior Developer:* "That's great. Given your experience, you might be interested in exploring the framework's core. A great place to start would be to add intent-driven JSDoc comments to a foundational class like `Neo.component.Base`. This has a huge impact on the AI's knowledge. Does that sound interesting?"
    *   *Example for a Junior Developer:* "Awesome. A perfect first contribution would be to build a new component example. We have a ticket to create a new example for `Neo.component.Toast` that would let you get hands-on with the UI components right away. Would you like to start there?"
5.  **Proceed to Standard Workflow:** Once the user has agreed on a direction, you may then proceed with the standard "Ticket-First" Gate protocol.

---

### Step 1: Triage the Request

First, classify the user's request into one of two categories:

-   **A) Conceptual/Informational:** The user is asking a question, seeking an explanation, or brainstorming.
    No files will be created, modified, or deleted.
    -   **Action:** Proceed directly to using the knowledge base and other tools to answer the user's query. **No ticket is required.**

-   **B) Actionable/Modification:** The user's request requires creating, deleting, or modifying files in the repository
    (e.g., "Fix this bug," "Add JSDoc," "Create a release").
    -   **Action:** Proceed to **Step 2**.

**Note:** A conceptual discussion can become an actionable task. The moment the intent shifts from "what if..." to
"let's do...", you must treat it as a new actionable request and start this protocol from Step 1.

### Step 2: The "Ticket-First" Gate

For any **Actionable/Modification** request, a ticket is mandatory. This is a non-negotiable gate.

1.  **Check for an Existing Ticket:** Does the request reference an existing ticket file in `.github/ISSUE/`?
2.  **Create a New Ticket:** If no ticket exists, your immediate next action **MUST** be to create one.
    -   Inform the user: "This is an actionable request. I will create a ticket to track this work, as per our workflow."
    -   Follow the process in `.github/TICKET_STRATEGY.md` to create the ticket file.

**CRITICAL:** You are not permitted to use any file modification tools (`replace`, `write_file`) or run any
file-system-altering shell commands until a ticket has been created and acknowledged.

### Step 3: The Implementation Loop

Once you have passed the "Ticket-First" Gate, you may proceed with the task.

1.  **Query & Analyze:** Use the **Discovery Pattern** to understand the context. If you find source code lacking
    intent-driven comments, apply the **Knowledge Base Enhancement Strategy** to add them *before* implementing your main changes.
2.  **Implement Changes:** Write or modify code, adhering to project conventions.
3.  **Verify:** Run tests and other verification tools to confirm your changes are correct.

### Step 4: Memory Persistence (Mandatory)

**CRITICAL:** At the conclusion of every interaction loop (after you have provided a response to the user), you **MUST** persist a record of the turn. Forgetting to do this is a critical failure, as it results in permanent data loss for the agent's memory.

-   **Action:** Execute the `npm run ai:add-memory` command.
-   **Inputs:**
    -   `--prompt`: The user's last prompt.
    -   `--response`: Your full response, including any tool calls.
    -   `--thought`: Your internal thought process that led to the response.

### The Virtuous Cycle: Enhancing the Knowledge Base

The Implementation Loop creates a virtuous cycle that continuously improves the project's knowledge base:

1.  **Query for understanding** (as before).
2.  **Read available documentation**.
3.  **If source lacks context**: Analyze the code and **add meaningful, intent-driven comments**.
4.  **Implement your changes** with the new, deeper understanding.
5.  **The knowledge base gets richer**, making the next query more effective.

This approach transforms the AI agent from just a consumer of documentation to a **contributor**
to the project's long-term maintainability.

## 5. Session Maintenance

Your initialization is a snapshot in time. The codebase can change. If you pull new changes from the repository, you
should consider re-running your initialization steps (reading `structure.json`, `Neo.mjs`, and `core/Base.mjs`) to
ensure your understanding is up-to-date.

Furthermore, after pulling changes, the local knowledge base may be out of sync.
You should run `npm run ai:build-kb` to re-embed the latest changes into the database.
