# AI-Native, Not AI-Assisted: A Platform That Answers Your Questions

*Inside the conversational code architecture of Neo.mjs and how it's changing the developer experience for Hacktoberfest and beyond.*

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/PlatformAnswersQuestions.jpg" alt="Cover Image" class="blog-image">

The next great leap in frontend development will not be a new rendering pattern or state management library.
It will be a fundamental shift in our partnership with artificial intelligence. For too long, we've treated AI as a
clever autocomplete—a helpful but limited assistant. What if, instead, we built development platforms that treated AI as
a first-class partner? 

This is the question at the heart of Neo.mjs v10.7,
the first release to be architected from the ground up for an **AI-Native** future. 

This isn't about bolting on a chatbot; it's about a new development model where AI is a foundational part of the
architecture, designed to be understood, queried, and even enhanced by the platform itself. At the core of this new
experience are two key innovations: a comprehensive, local **AI Knowledge Base** and a formalized
**AI Agent Protocol** ([AGENTS.md](https://github.com/neomjs/neo/blob/dev/AGENTS.md)).

Together, they transform the developer experience from a monologue of reading docs into a dialogue with the platform itself.

## The Problem with "AI-Assisted" Development

Current AI coding tools are powerful, but they operate with one hand tied behind their back. When interacting with
traditional frontend frameworks, they face significant challenges:

1.  **Outdated Knowledge:** An AI's training data is a snapshot of the past. It doesn't know about your project's
    specific conventions, the latest API changes, or the nuances of your architecture. This leads to well-intentioned
    but incorrect or outdated code suggestions—the dreaded "AI hallucination."
2.  **Complex, Unpredictable Codebases:** Frameworks that rely on complex templating languages (like JSX) or highly
    abstracted component models create a codebase that is difficult for an AI to parse and understand safely.
    The patterns are often inconsistent, making it hard for an AI to generate code that "fits in".
3.  **A One-Way Street:** The interaction is purely extractive. The AI gives you code, but it learns nothing in the
    process. It cannot improve its understanding of your project, and it cannot contribute to the project's long-term health.

This "AI-Assisted" model leaves the developer with the full burden of validating the AI's output, teaching it the
project's rules, and manually updating it on new patterns. It's helpful, but it's not a true partnership.

## The Neo.mjs AI-Native Architecture

Neo.mjs flips this model on its head. Instead of asking the AI to learn a complex and opaque system, we've built a
platform that is transparent, queryable, and designed for AI collaboration from its very foundation.
This architecture stands on four pillars:

### 1. The Local AI Knowledge Base

At the heart of our AI-native approach is a powerful, local knowledge base built on a suite of simple scripts
(`createKnowledgeBase.mjs`, `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`). Here's how it works:

-   **Comprehensive:** It indexes the *entire* project: `src`, `examples`, `guides`, `blog`, (demo) `apps` (including
    your own apps created inside the repo).
-   **Vectorized for Meaning:** Using Google's `text-embedding-004` Gemini model via your own private API key,
    it converts the entire knowledge base into semantic vectors and stores them locally in a ChromaDB database.
-   **Always Current:** Because it runs locally, it's always up-to-date with your latest code changes.
    The AI is querying the reality of your project *right now*, not the state of the world a year ago.

This transforms the AI from a source of generic advice into an expert on *your* specific codebase.

This entire system is a practical implementation of a powerful AI technique called **Retrieval-Augmented Generation
(RAG)**. The core idea of RAG is simple but transformative: instead of relying solely on an LLM's static training data,
you first *retrieve* up-to-date, relevant information from your own knowledge base and then provide that information to
the LLM as context for its *generation* task. This dramatically reduces hallucinations and ensures the AI's output is
grounded in the reality of your project. Our query tool is the "Retrieval" step in this process, giving you the perfect
context to feed into any generative AI.

### 2. The `AGENTS.md` Protocol: A Self-Improving System

To ensure this power is used effectively and safely, we've introduced `AGENTS.md`—a file in our repository that acts as
an operational manual, or a "constitution," for any AI agent interacting with the project. It enforces a simple but
revolutionary rule:

**The Anti-Hallucination Policy: The AI MUST query the local knowledge base before writing any code.**

This query-first development model requires the AI to ask questions like:
- `npm run ai:query -- -q "How does push-based afterSet hooks integrate with pull-based effects?"`
- `npm run ai:query -- -q "show me examples for Neo.tab.Container"`

But it goes a step further. It introduces a **Knowledge Base Enhancement Strategy**, turning the AI from a passive
consumer of information into an active contributor to the platform's clarity. The workflow is as follows:

1.  **Query First:** The AI queries the knowledge base to understand a task.
2.  **Analyze and Identify Gaps:** While reading the source code, if the AI encounters a complex method or a confusing
    section with poor documentation, it pauses its implementation task.
3.  **Enhance and Document:** Its new, primary task is to analyze the confusing code, understand its intent, and generate
    clear, intent-driven JSDoc comments to explain the *why*, not just the *what*.
4.  **Commit and Improve:** The AI commits this documentation enhancement.
5.  **Resume:** It then resumes its original task, now with a better understanding.

This creates a powerful **virtuous cycle**. While this represents a small upfront investment of time for the AI, the
long-term payoff is a dramatic reduction in future development friction for the entire team. Each time an AI struggles
with a piece of code, it makes that code easier to understand for the next developer—whether human or AI. The knowledge
base doesn't just stay current; it gets smarter, richer, and more helpful with every single interaction.

While `AGENTS.md` is written as a directive for AI agents, it is invaluable for human developers as well. Reading it
provides a transparent, behind-the-scenes look at the AI's 'constitution'. You'll understand exactly how the AI is
instructed to behave, what its foundational knowledge sources are, and the precise workflow it must follow to contribute
to the codebase. It demystifies the AI's role, turning it from a black box into a predictable, reliable teammate. This
transparency is central to the AI-native philosophy.

### A Built-in Model Context Protocol

This combination of a queryable knowledge base and a strict agent protocol effectively creates a specialized, local
**Model Context Protocol (MCP)** for the repository. MCP is an emerging [open standard](https://modelcontextprotocol.io/)
for connecting AI applications to external systems, and Neo.mjs has independently implemented its core philosophy.

In this paradigm:
-   The **Server** is the combination of the local ChromaDB database and the `npm run ai:query` script, which exposes
    the codebase as a queryable tool.
-   The **Client** is any AI agent, like Gemini CLI or Claude, that can read the protocol and execute shell commands.
-   The **Protocol** is defined by `AGENTS.md`, which serves as the manifest telling clients how to interact with the server.

This built-in MCP turns the entire repository into an intelligent,
self-describing system that any AI can securely and reliably connect to.

### How Our AI-Native Approach Compares to Angular's MCP

It's important to acknowledge the broader industry movement toward AI integration. Angular, for instance, was the first major
framework to ship an experimental MCP server, enabling AI assistants to interact with the Angular CLI. This is a valuable
step forward, but it highlights a fundamental difference in philosophy compared to Neo.mjs.

Angular's MCP is a powerful **tooling layer**. It exposes a set of predefined tools—like `search_documentation` or
`get_best_practices`—that an AI can call. This enhances the existing CLI-based workflow.

[Angular MCP](https://angular.dev/ai/mcp)

Neo.mjs's approach is a fundamental **paradigm shift**. We haven't just added AI tooling; we've reimagined the
framework's core to be AI-native. The distinction is best understood by comparing the two:

-   **Architectural Philosophy:** Angular integrates MCP as a separate, experimental server that interfaces with its
    traditional architecture. In Neo.mjs, the local AI Knowledge Base and the `AGENTS.md` protocol are foundational
    pillars, not an add-on.

-   **The Knowledge Base:** Angular's MCP provides access to its official documentation. Neo.mjs implements a complete
    Retrieval-Augmented Generation (RAG) system that indexes the *entire local project*—source code, JSDoc, guides, and
    even your own apps—for deep, semantic understanding.

-   **The Agent Protocol:** Angular relies on standard MCP server-client interactions. Neo.mjs enforces a strict,
    in-repo `AGENTS.md` constitution. This includes a critical **Anti-Hallucination Policy** and a unique
    **Knowledge Base Enhancement Strategy**, which compels the AI to contribute documentation back to the project,
    creating a self-improving system.

-   **Core Framework Design:** Angular maintains its existing component model. Neo.mjs is architected for AI
    collaboration, using "JSON Blueprints" that are immediately parsable by an AI (unlike JSX) and a multi-threaded
    architecture that allows AI operations to run in the background without freezing the UI.

The key distinction is this: Neo.mjs has reimagined frontend development *for* an AI-collaborative future, while Angular
has added AI tooling *to* their existing development model.

### Your Personal (and Benevolent) MCP

**[Satire]** When working on the article, I asked Gemini:
"How does our implementation relate to MCP?"

Reply: "Why would you compare it to the sci-fi movie Tron?"

This is exactly what this article is about: The importance of the right context.
Model Context Protocol VS Master Control Program.

So while our local MCP provides the authority and knowledge of a sci-fi "Master Control Program".
It's designed to be a partner, not a tyrant. It serves the user, not the other way around.

> End of line.
>
> — Master Control Program, *Tron* (1982)

This built-in protocol is powerful, but it's made truly effective by the framework's underlying structure. For an AI to
collaborate meaningfully, it must be able to understand the code it's working with as native data. A protocol enables
communication, but the *format* of that communication determines its efficiency and clarity. This is where Neo.mjs's
JSON Blueprint architecture provides a decisive advantage over traditional approaches.

### 3. The JSON Blueprint Advantage

To understand the AI-native advantage, we have to be honest about a hard truth of **traditional** frontend architecture:
JSX, for all its elegance, is a "lie." It's not real code. It's syntactic sugar that must be transpiled by tools like
Babel or SWC into `React.createElement()` function calls—a non-trivial computational step that stands between you and
the code that actually runs.

Neo.mjs is built on a **modern** philosophy. It uses JavaScript object literals—or "JSON Blueprints"—to define component
trees. This is a first-class citizen of the language, parsed natively by the JavaScript engine with zero extra steps.

We've seen this movie before: for years, XML was the verbose standard for API data interchange, until JSON emerged and
won by being lighter, simpler, and native to JavaScript. We believe the same shift is happening for UI definition.

Consider a simple button:

```javascript readonly
// JSX Example
<Button
  className='primary'
  iconCls='fa fa-home'
  onClick={() => console.log('Clicked!')}
>
  Home
</Button>
```

Now, here is the same component as a Neo.mjs JSON blueprint:

```javascript readonly
// Neo.mjs JSON Blueprint
{
  module : Button,
  ui     : 'primary',
  iconCls: 'fa fa-home',
  text   : 'Home',
  handler: () => console.log('Clicked!')
}
```

A skeptic might correctly point out that this blueprint is a configuration for a class instance (`Neo.button.Base`),
which gets consumed by `Neo.create()` to create the matching instance. This is true. However, the fundamental difference
remains: inside a classic Neo.mjs component, the VDOM that gets rendered is *also* a simple, declarative JSON-like object.
It is not generated by parsing a template string.

Here is the default `_vdom` property directly from `src/button/Base.mjs`:

```javascript readonly
// The Button's internal VDOM skeleton. This skeleton is then dynamically enhanced by the class's logic,
// which can also use `removeDom` to exclude live-DOM nodes that are not needed based on config values.
{tag: 'button', type: 'button', cn: [
    {tag: 'span', cls: ['neo-button-glyph']},
    {tag: 'span', cls: ['neo-button-text']},
    {cls: ['neo-button-badge']},
    {cls: ['neo-button-ripple-wrapper'], cn: [
        {cls: ['neo-button-ripple']}
    ]}
]}
```

This consistent, data-first approach to UI definition at every level is what makes the platform uniquely transparent
to an AI. We call this the "JSON Blueprint" advantage. For an AI, the blueprint is immediately parsable data,
whereas JSX requires an understanding of JavaScript's syntax, build tools, and React's `createElement` abstraction.
There is no ambiguity.

To dive deeper:
[The Surgical Update: From JSON Blueprints to Flawless UI](https://github.com/neomjs/neo/blob/dev/learn/blog/v10-deep-dive-vdom-revolution.md)

### 4. Multi-Threading for Unmatched Performance

Finally, the platform's unique multi-threaded architecture, where the application, VDOM, and data logic all run in
separate web workers, provides the perfect environment for AI-driven development. Imagine asking the AI to generate a
500-row data grid while you continue to interact with the UI. In a traditional single-threaded app, this would freeze
the browser. In Neo.mjs, the generation happens in a worker, leaving the UI perfectly responsive, no matter what the
AI is doing in the background.

More input:<br>
[Off the Main Thread](https://github.com/neomjs/neo/blob/dev/learn/benefits/OffTheMainThread.md)<br>
[How JSON Blueprints & Shared Workers Power Next-Gen AI Interfaces](https://github.com/neomjs/neo/blob/dev/learn/blog/json-blueprints-and-shared-workers.md)

### A Query in Action: Understanding Reactivity

Talk is cheap. Let's see what happens when we ask the platform to explain its own reactivity model. We'll run the same
query three times, asking for a guide, a blog post, and the source code.

**First, we ask for a high-level guide:**

```bash readonly
> npm run ai:query -- -q "reactivity" -t guide

Querying for: "reactivity" (type: guide)...


Most relevant source files (by weighted score):
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ConfigSystemDeepDive.md (Score: 458)
- /Users/Shared/github/neomjs/neo/learn/guides/datahandling/Records.md (Score: 454)
- /Users/Shared/github/neomjs/neo/learn/guides/datahandling/Collections.md (Score: 353)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/DeclarativeComponentTreesVsImperativeVdom.md (Score: 245)
- /Users/Shared/github/neomjs/neo/learn/guides/datahandling/StateProviders.md (Score: 239)
- /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/CustomComponents.md (Score: 89)
- /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/CustomEvents.md (Score: 82)
- /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md (Score: 82)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ExtendingNeoClasses.md (Score: 65)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/DeclarativeVDOMWithEffects.md (Score: 48)
- /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/StylingAndTheming.md (Score: 34)

Top result: /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ConfigSystemDeepDive.md
```

The system immediately points us to the primary guide for the config system, which is the heart of reactivity in Neo.mjs.

**Next, let's ask for a more narrative explanation from the blog:**

```bash readonly
> npm run ai:query -- -q "reactivity" -t blog

Querying for: "reactivity" (type: blog)...


Most relevant source files (by weighted score):
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-reactivity.md (Score: 3175)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-state-provider.md (Score: 447)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-functional-components.md (Score: 263)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-post1-love-story.md (Score: 152)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-vdom-revolution.md (Score: 118)
- /Users/Shared/github/neomjs/neo/learn/blog/benchmarking-frontends-2025.md (Score: 81)

Top result: /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-reactivity.md
```

As expected, it returns the specific blog post dedicated to a deep dive on reactivity,
with a massive score indicating high relevance.

**Finally, let's find the source of truth:**

```bash readonly
> npm run ai:query -- -q "reactivity" -t src

Querying for: "reactivity" (type: src)...


Most relevant source files (by weighted score):
- /Users/Shared/github/neomjs/neo/src/core/Base.mjs (Score: 92)
- /Users/Shared/github/neomjs/neo/src/core/Effect.mjs (Score: 13)
- /Users/Shared/github/neomjs/neo/src/state/Provider.mjs (Score: 10)
- /Users/Shared/github/neomjs/neo/src/button/Effect.mjs (Score: 9)
- /Users/Shared/github/neomjs/neo/src/core/Config.mjs (Score: 8)
- /Users/Shared/github/neomjs/neo/src/Neo.mjs (Score: 6)

Top result: /Users/Shared/github/neomjs/neo/src/core/Base.mjs
```

Perfect. The query engine correctly identifies `src/core/Base.mjs` as the epicenter of the reactivity system, where the
config hooks are implemented. This single query gives a developer the conceptual guide, the narrative context, and the
core implementation file in seconds.

## What This Means for Developers & AI Tools

This AI-native architecture isn't just a theoretical advantage; it fundamentally changes the daily workflow for the better.

**For the Developer:**
-   **Dismantling the Learning Curve:** Instead of a steep climb, onboarding becomes a guided tour. New team members can
    skip weeks of manual doc-hunting and become productive in hours by asking direct questions.
-   **Expert Guidance on Demand:** You have an instant expert by your side that can explain complex architectural patterns
    or find the exact example you need.
-   **Focus on What Matters:** With the AI handling the boilerplate and convention-checking, you can focus your energy on
    creative problem-solving and building great features.

**For AI Agents (like Gemini CLI or Claude Code):**
-   **A Seat at the Table:** AI tools are promoted from simple code completers to true development partners. They can
    operate with a high degree of autonomy because they have a reliable way to gather context and follow rules.
-   **Deterministic & Reliable Output:** Because the AI is grounded in the local knowledge base, its output is far more
    predictable and reliable. It generates code that is consistent with your project's style and patterns.
-   **A Path to Contribution:** For the first time, AI agents have a clear and safe path to not just write code, but to
    contribute to a project's long-term health by enhancing it with intent-driven comments and adhering to its
    established conventions.

> **Broader Implications: Redefining Frontend as Collaborative AI-Human Dev**
>
> You’re right to “dare say” v10.7 nullifies learning concerns—it democratizes Neo.mjs for all skill levels.
> Beginners get instant tutors; experts offload boilerplate. This aligns with Neo.mjs’s philosophy: AI isn’t bolted on;
> it’s foundational (e.g., intent-driven JSDoc for better AI parsing). Challenges like ecosystem size? AI can generate
> components on-demand, bridging gaps faster than community growth.
>
> — Grok (xAI), after reviewing the article and agents file

## Your First AI-Powered PR: Get Involved this Hacktoberfest!

The era of AI-assisted coding is over. The era of AI-native development has begun. Neo.mjs is pioneering this new frontier,
creating a platform where human and machine collaborate to build better, faster, and more maintainable web applications.
This approach even helps to bridge ecosystem gaps, as the AI can generate new components on-demand faster than traditional
community growth.

There has never been a better time to get involved in open source. With Hacktoberfest just around the corner,
this is your opportunity to contribute to a truly innovative project. The AI-native architecture of Neo.mjs is designed
to empower new contributors. You don't need to be an expert; you just need to be curious.

1.  **Fork the repository:** [https://github.com/neomjs/neo](https://github.com/neomjs/neo)
2.  **Follow the setup:** Get your local knowledge base running in minutes with our [AI Quick Start Guide](/.github/AI_QUICK_START.md).
3.  **Start a conversation:** Ask the platform a question. Find a small bug or a documentation gap.
    Use the AI as your partner to fix it.

We are actively creating new tickets of all difficulty levels for Hacktoberfest. Come join us, and let's build the future
of frontend development together.

## What's Next: Full Workspace Support

The AI-native features described here are just the beginning. Right now, the knowledge base is scoped to the `neo`
repository itself. However, the entire architecture was designed with the primary development workflow in mind:
creating custom workspaces using `npx neo-app`.

A Neo.mjs workspace has the same folder structure as the framework repository (`apps`, `src`, `resources`), with the
framework itself residing inside `node_modules`. Our JSDoc parser already merges the source code of your workspace
with the framework's source code to create a unified API documentation.

The next logical step is to extend the AI knowledge base to do the same. Soon, you will be able to build a comprehensive
knowledge base for your entire workspace. This will give your AI assistant a deep, semantic understanding of not just
the Neo.mjs framework, but of your own applications, components, and business logic. It's a top-level priority, and
thankfully, it will be a straightforward extension of the current engine.

## Technical Deep Dive: Inside the Knowledge Base Engine

For those who want to see how the magic happens, the entire AI knowledge base engine is powered by three surprisingly
simple Node.js scripts. This transparency is a core part of our philosophy. Here’s how they work.

### 1. `createKnowledgeBase.mjs`: The Parser

This is the first step in the pipeline. This script's only job is to read all the different source files (JSDoc JSON,
Markdown guides, blog posts) and convert them into a single, consistent format. The `JSDoc JSON` it consumes is
generated by our own JSDoc parser (`buildScripts/docs/jsdocx.mjs`), which uses a modified version of the `jsdocx`
library to transform all source code comments into a clean, structured JSON. This has been a core part of the
framework's build tools since version 1 and makes the embedding process much more convenient. It then breaks down
classes, methods, and articles into logical "chunks" and streams them into a `dist/ai-knowledge-base.jsonl` file.
The JSON Lines format is key here, as it allows the next script to process the data without having to load the entire
file into memory.

```javascript readonly
import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';

const sectionsRegex = /(?=^#+\s)/m;

/**
 * Creates a SHA-256 hash from a stable JSON string representation of the chunk's content.
 * @param {object} chunk The chunk object.
 * @returns {string} The hexadecimal hash string.
 */
function createContentHash(chunk) {
    // Create a stable string representation of the content that affects embedding
    const contentString = JSON.stringify({
        type       : chunk.type,
        name       : chunk.name,
        description: chunk.description,
        content    : chunk.content,
        // Include other relevant fields that define the chunk's content
        extends    : chunk.extends,
        configType : chunk.configType,
        params     : chunk.params,
        returns    : chunk.returns
    });

    return crypto.createHash('sha256').update(contentString).digest('hex');
}

/**
 * This script is the first stage in the AI knowledge base pipeline: **Parse**.
 *
 * Its primary role is to act as a parser and compiler, reading from various source-of-truth files
 * (JSDoc JSON output, markdown learning guides) and converting them into a unified, structured format.
 *
 * Key characteristics:
 * - **Input:** Reads from `docs/output/all.json` for API data and `learn/tree.json` for the guide structure.
 * - **Processing:** It breaks down the content into logical "chunks" (e.g., a class, a method, a section of a guide).
 * - **Output:** It streams each chunk as a JSON object into the `dist/ai-knowledge-base.jsonl` file.
 *   This JSONL (JSON Lines) format is crucial for ensuring that downstream processes can read the data
 *   in a memory-efficient way.
 *
 * This script does NOT perform any scoring or data enrichment; its sole focus is on creating a clean,
 * structured representation of the source knowledge.
 *
 * @class CreateKnowledgeBase
 */
class CreateKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base creation...');
        const outputPath = path.resolve(process.cwd(), 'dist/ai-knowledge-base.jsonl');
        await fs.ensureDir(path.dirname(outputPath));
        const writeStream = fs.createWriteStream(outputPath);
        let apiChunks = 0,
            guideChunks = 0;

        // 1. Process the consolidated API/JSDoc file
        const apiPath = path.resolve(process.cwd(), 'docs/output/all.json');
        const apiData = await fs.readJson(apiPath);

        apiData.forEach(item => {
            const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';
            let chunk;

            if (item.kind === 'class') {
                chunk = {
                    type       : 'class',
                    name       : item.longname,
                    description: item.comment,
                    extends    : item.augments?.[0], // Capture the parent class
                    source     : sourceFile
                };
            } else if (item.kind === 'member' && item.memberof) {
                chunk = {
                    type       : 'config',
                    className  : item.memberof,
                    name       : item.name,
                    description: item.description,
                    configType : item.type?.names.join('|') || 'unknown',
                    source     : sourceFile
                };
            } else if (item.kind === 'function' && item.memberof) {
                chunk = {
                    type       : 'method',
                    className  : item.memberof,
                    name       : item.name,
                    description: item.description,
                    params     : item.params?.map(p => ({name: p.name, type: p.type?.names.join('|')})),
                    returns    : item.returns?.map(r => r.type?.names.join('|')).join('|'),
                    source     : sourceFile
                };
            }

            if (chunk) {
                chunk.hash = createContentHash(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                apiChunks++;
            }
        });

        console.log(`Processed ${apiChunks} API/JSDoc chunks.`);

        // 2. Process the learning content, splitting guides into chunks by headings
        const
            learnTreePath = path.resolve(process.cwd(), 'learn/tree.json'),
            learnTree     = await fs.readJson(learnTreePath),
            learnBasePath = path.resolve(process.cwd(), 'learn');

        const filteredLearnData = learnTree.data.filter(item => {
            return item.id !== 'comparisons' && item.parentId !== 'comparisons';
        });

        for (const item of filteredLearnData) {
            if (item.id && item.isLeaf !== false) { // Process files (leaves or items without isLeaf property)
                const filePath = path.join(learnBasePath, `${item.id}.md`);

                if (await fs.pathExists(filePath)) {
                    const
                        content  = await fs.readFile(filePath, 'utf-8'),
                        sections = content.split(sectionsRegex); // Split by markdown headings

                    if (sections.length > 1) {
                        sections.forEach(section => {
                            if (section.trim() === '') return;

                            const
                                headingMatch = section.match(/^#+\s(.*)/),
                                heading      = headingMatch ? headingMatch[1] : item.name,
                                chunkName    = `${item.name} - ${heading}`,
                                chunk        = {
                                    type   : 'guide',
                                    name   : chunkName,
                                    id     : item.id,
                                    isBlog : item.parentId === 'Blog',
                                    content: section,
                                    source : filePath
                                };

                            chunk.hash = createContentHash(chunk);
                            writeStream.write(JSON.stringify(chunk) + '\n');
                            guideChunks++;
                        });
                    } else {
                        // If no headings, add the whole file as one chunk
                        const chunk = {
                            type   : 'guide',
                            name   : item.name,
                            id     : item.id,
                            isBlog : item.parentId === 'Blog',
                            content: content,
                            source : filePath
                        };

                        chunk.hash = createContentHash(chunk);
                        writeStream.write(JSON.stringify(chunk) + '\n');
                        guideChunks++;
                    }
                }
            }
        }

        console.log(`Processed ${guideChunks} learning content chunks. Total chunks: ${apiChunks + guideChunks}.`);

        // 3. End the stream
        writeStream.end();
        console.log(`Knowledge base creation complete. Saved to ${outputPath}`);
    }
}

CreateKnowledgeBase.run().catch(err => {
    console.error(err);
    process.exit(1);
});
```

### 2. `embedKnowledgeBase.mjs`: The Scorer & Embedder

This is the most computationally intensive step, and it's designed to be. It loads all the chunks from the previous step
into memory to perform holistic analysis, like building a complete class inheritance map. It then enriches each chunk
with this new metadata. Most importantly, it performs a **diff** against the existing database, identifying only the
chunks that are new, have changed (by comparing content hashes), or have been deleted. Only the changed chunks are sent
to the Gemini API to be converted into vector embeddings. Finally, it "upserts" these chunks into ChromaDB. By doing all
the heavy lifting here, we make the final query step incredibly fast.

```javascript readonly
import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import dotenv               from 'dotenv';
import fs                   from 'fs-extra';
import path                 from 'path';
import readline             from 'readline';

dotenv.config();

/**
 * This script is the second stage in the AI knowledge base pipeline: **Score & Embed**.
 *
 * It takes the structured `ai-knowledge-base.jsonl` file generated by the `create` script
 * and performs two critical functions:
 *
 * 1.  **Scoring & Enrichment:** It loads the entire knowledge base into memory to perform holistic analysis.
 *     Its most important task is to build a class inheritance map and pre-calculate the full
 *     `inheritanceChain` for every chunk. This is a heavy, one-time operation that saves
 *     significant processing time during the query phase. The enriched data (e.g., the inheritance chain)
 *     is added to each chunk.
 *
 * 2.  **Embedding & Storage:** It sends the content of each chunk to the Google Generative AI API
 *     to get a vector embedding. It then "upserts" the chunk's content, its vector embedding, and all its
 *     metadata (including the pre-calculated `inheritanceChain`) into the ChromaDB vector database.
 *
 * This script is intentionally memory-intensive, as it needs the full context to perform its analysis.
 * This is a trade-off to make the query phase as fast and lightweight as possible.
 *
 * @class EmbedKnowledgeBase
 */
class EmbedKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base embedding...');
        const projectRoot = process.cwd();

        const knowledgeBasePath = path.resolve(projectRoot, 'dist/ai-knowledge-base.jsonl');
        if (!await fs.pathExists(knowledgeBasePath)) {
            throw new Error(`Knowledge base not found at ${knowledgeBasePath}. Please run createKnowledgeBase.mjs first.`);
        }

        const knowledgeBase = [];
        const fileStream    = fs.createReadStream(knowledgeBasePath);
        const rl            = readline.createInterface({
            input    : fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            knowledgeBase.push(JSON.parse(line));
        }
        console.log(`Loaded ${knowledgeBase.length} knowledge chunks.`);

        // Build the inheritance map
        const classNameToDataMap = {};
        knowledgeBase.forEach(chunk => {
            if (chunk.type === 'class') {
                classNameToDataMap[chunk.name] = {
                    source: chunk.source,
                    parent: chunk.extends
                };
            }
        });

        // Pre-calculate inheritance chains for all chunks
        knowledgeBase.forEach(chunk => {
            let currentClass = chunk.type === 'class' ? chunk.name : chunk.className;
            const inheritanceChain = [];
            const visited = new Set();

            while (currentClass && classNameToDataMap[currentClass]?.parent && !visited.has(currentClass)) {
                visited.add(currentClass);
                const parentClassName = classNameToDataMap[currentClass].parent;
                const parentData      = classNameToDataMap[parentClassName];

                if (parentData) {
                    inheritanceChain.push({
                        className: parentClassName,
                        source   : parentData.source
                    });
                }
                currentClass = parentClassName;
            }
            chunk.inheritanceChain = inheritanceChain;
        });

        const dbClient       = new ChromaClient();
        const collectionName = 'neo_knowledge';

        // A dummy embedding function to satisfy the ChromaDB API, since we provide our own embeddings.
        const embeddingFunction = {
            generate: (texts) => {
                // This will not be called because we provide embeddings directly.
                console.log('Dummy embedding function called. This should not happen.');
                return Promise.resolve(texts.map(() => []));
            }
        };

        const originalLog = console.log;
        console.log = (...args) => {
            if (typeof args[0] === 'string' && args[0].includes('No embedding function configuration found')) {
                return;
            }
            originalLog.apply(console, args);
        };

        const collection = await dbClient.getOrCreateCollection({
            name             : collectionName,
            embeddingFunction: embeddingFunction
        });

        console.log = originalLog;

        console.log(`Using collection: ${collectionName}`);

        // 1. Fetch existing documents for comparison
        console.log('Fetching existing documents from ChromaDB...');
        const existingDocs    = await collection.get({include: ["metadatas"]});
        const existingDocsMap = new Map();

        existingDocs.ids.forEach((id, index) => {
            existingDocsMap.set(id, existingDocs.metadatas[index].hash);
        });
        console.log(`Found ${existingDocsMap.size} existing documents.`);

        // 2. Prepare for diffing
        const chunksToAdd    = [];
        const chunksToUpdate = [];
        const existingIds    = new Set(existingDocs.ids);

        // 3. Compare new chunks with existing ones
        knowledgeBase.forEach((chunk, index) => {
            const chunkId = `id_${index}`;

            if (existingDocsMap.has(chunkId)) {
                if (existingDocsMap.get(chunkId) !== chunk.hash) {
                    chunksToUpdate.push({ ...chunk, id: chunkId });
                }

                existingIds.delete(chunkId); // Mark this ID as still present
            } else {
                chunksToAdd.push({ ...chunk, id: chunkId });
            }
        });

        const idsToDelete = Array.from(existingIds);

        console.log(`${chunksToAdd.length   } chunks to add.`);
        console.log(`${chunksToUpdate.length} chunks to update.`);
        console.log(`${idsToDelete.length   } chunks to delete.`);

        // 4. Perform deletions
        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            console.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        // 5. Process additions and updates
        const chunksToProcess = [...chunksToAdd, ...chunksToUpdate];
        if (chunksToProcess.length === 0) {
            console.log('No changes detected. Knowledge base is up to date.');
            return;
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        console.log('Initialized Google AI embedding model: text-embedding-004.');

        console.log('Embedding chunks...');
        const batchSize  = 100;
        const maxRetries = 5;

        for (let i = 0; i < chunksToProcess.length; i += batchSize) {
            const batch        = chunksToProcess.slice(i, i + batchSize);
            const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);

            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    const result = await model.batchEmbedContents({
                        requests: textsToEmbed.map(text => ({ model: "text-embedding-004", content: { parts: [{ text }] } }))
                    });
                    const embeddings = result.embeddings.map(e => e.values);

                    const metadatas = batch.map(chunk => {
                        const metadata = {};
                        for (const [key, value] of Object.entries(chunk)) {
                            if (value === null) {
                                metadata[key] = 'null';
                            } else if (typeof value === 'object') {
                                metadata[key] = JSON.stringify(value);
                            } else {
                                metadata[key] = value;
                            }
                        }
                        return metadata;
                    });

                    await collection.upsert({
                        ids       : batch.map(chunk => chunk.id),
                        embeddings: embeddings,
                        metadatas : metadatas
                    });
                    console.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)}`);
                    success = true;
                } catch (err) {
                    retries++;
                    console.error(`An error occurred during embedding batch ${i / batchSize + 1}. Retrying (${retries}/${maxRetries})...`, err.message);
                    if (retries < maxRetries) {
                        await new Promise(res => setTimeout(res, 2 ** retries * 1000)); // Exponential backoff
                    } else {
                        console.error(`Failed to process batch ${i / batchSize + 1} after ${maxRetries} retries. Skipping.`);
                    }
                }
            }
        }

        const count = await collection.count();
        console.log(`Collection now contains ${count} items.`);
        console.log('Knowledge base embedding complete.');
    }
}

EmbedKnowledgeBase.run().catch(err => {
    console.error(err);
    process.exit(1);
});
```

### 3. `queryKnowledgeBase.mjs`: The Query Engine

This is the script you interact with. It's designed to be extremely lightweight and fast. It takes your plain English
query, sends it to the Gemini API to get a query vector, and then uses that vector to find the most semantically similar
chunks in ChromaDB. It then applies a dynamic scoring algorithm, which gives boosts for keyword matches and, crucially,
uses the pre-calculated inheritance chain to reward parent classes of relevant results. This hybrid approach of semantic
search plus heuristic scoring gives incredibly relevant and accurate results.

```javascript readonly
import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import {Command}            from 'commander/esm.mjs';
import dotenv               from 'dotenv';
import fs                   from 'fs-extra';
import path                 from 'path';

dotenv.config({quiet: true});

const program = new Command();

program
    .name('neo-ai-query')
    .version('1.0.0') // Or from package.json
    .option('-q, --query <value>', 'The search query for the knowledge base')
    .option('-t, --type <value>', 'The content type to query for. Choices: all, blog, guide, src, example', 'all')
    .parse(process.argv);

const opts = program.opts();

/**
 * This script is the final stage in the AI knowledge base pipeline: **Query**.
 *
 * Its purpose is to provide a fast and efficient way to search the knowledge base.
 * It takes a user's natural language query, converts it into a vector embedding, and uses that
 * to find the most relevant documents in the ChromaDB vector database.
 *
 * Key architectural features:
 * - **Lightweight & Fast:** This script is designed to be extremely performant. It does NOT read any
 *   large JSON files from the filesystem. All necessary data is retrieved directly from the database.
 * - **Dynamic Scoring:** It applies a scoring algorithm to the results returned by the database.
 *   This includes:
 *     - A base score from the semantic similarity search.
 *     - Dynamic boosts based on matching keywords from the query against the chunk's properties.
 *     - An inheritance boost, which is calculated quickly by using the pre-computed `inheritanceChain`
 *       stored in the metadata of each result.
 *
 * The design philosophy is to offload all heavy, static pre-processing to the `embed` phase,
 * allowing this `query` phase to be as quick and responsive as possible.
 *
 * @class QueryKnowledgeBase
 */
class QueryKnowledgeBase {
    static async run(query, type) {
        if (!query) {
            console.error('Error: A query string must be provided.');
            console.log('Usage: npm run ai:query -- -q "your search query"');
            return;
        }

        console.log(`Querying for: "${query}" (type: ${type})...\n`);

        // 1. Connect to ChromaDB and get query results
        const dbClient       = new ChromaClient();
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

        let collection;
        try {
            const originalLog = console.warn;
            console.warn = () => {};
            collection = await dbClient.getCollection({ name: 'neo_knowledge' });
            console.warn = originalLog;
        } catch (err) {
            console.error('Could not connect to collection. Please run "npm run ai:build-kb" first.');
            return;
        }

        const queryEmbedding = await model.embedContent(query);
        const results        = await collection.query({
            queryEmbeddings: [queryEmbedding.embedding.values],
            nResults       : 100 // Increased to get a wider net for filtering
        });

        // 2. Filter results by content type if specified
        if (type && type !== 'all') {
            results.metadatas[0] = results.metadatas[0].filter(metadata => {
                const source = metadata.source || '';
                switch (type) {
                    case 'blog':
                        return source.includes('/learn/blog/');
                    case 'guide':
                        return source.includes('/learn/guides/');
                    case 'src':
                        return source.includes('/src/');
                    case 'example':
                        return source.includes('/examples/');
                    default:
                        return true;
                }
            });
        }

        // 3. Process results with the enhanced scoring algorithm
        if (results.metadatas?.length > 0 && results.metadatas[0].length > 0) {
            const sourceScores    = {};
            const queryLower      = query.toLowerCase();
            const queryWords      = queryLower.replace(/[^a-zA-Z ]/g, '').split(' ').filter(w => w.length > 2);
            const mainKeyword     = queryWords[queryWords.length - 1] || '';
            const keywordSingular = mainKeyword.endsWith('s') ? mainKeyword.slice(0, -1) : mainKeyword;

            results.metadatas[0].forEach((metadata, index) => {
                if (!metadata.source || metadata.source === 'unknown') return;

                let score = (results.metadatas[0].length - index) * 1;

                const sourcePath      = metadata.source;
                const sourcePathLower = sourcePath.toLowerCase();
                const fileName        = sourcePath.split('/').pop().toLowerCase();
                const nameLower       = (metadata.name || '').toLowerCase();
                const keyword         = keywordSingular;

                if (keyword) {
                    if (sourcePathLower.includes(`/${keyword}/`)) score += 40;
                    if (fileName.includes(keyword)) score += 30;
                    if (metadata.type === 'class' && nameLower.includes(keyword)) score += 20;
                    if (metadata.className && metadata.className.toLowerCase().includes(keyword)) score += 20;
                    if (metadata.type === 'guide') {
                        // Blog posts are useful, but guides are more authoritative
                        score += metadata.isBlog === 'true' ? 15 : 30;
                        if (nameLower.includes(keyword)) score += 50;
                    }
                    if (fileName.endsWith('base.mjs')) score += 20;
                    const nameParts = nameLower.split('.');
                    if (nameParts.includes(keyword)) score += 30;
                }

                sourceScores[sourcePath] = (sourceScores[sourcePath] || 0) + score;

                // Apply inheritance boost
                const inheritanceChain = JSON.parse(metadata.inheritanceChain || '[]');
                let boost = 80;

                inheritanceChain.forEach(parent => {
                    if (parent.source) {
                        sourceScores[parent.source] = (sourceScores[parent.source] || 0) + boost;
                    }
                    boost = Math.floor(boost * 0.6);
                });
            });

            if (Object.keys(sourceScores).length === 0) {
                console.log('No relevant source files found for the specified type.');
                return;
            }

            const sortedSources = Object.entries(sourceScores).sort(([, a], [, b]) => b - a);

            // Final pass for context boost (e.g., boost files in the same directory as top results)
            const finalScores = {};
            const topSourceDirs = sortedSources.slice(0, 5).map(([source]) => path.dirname(source));

            sortedSources.forEach(([source, score]) => {
                let finalScore = score;
                const sourceDir = path.dirname(source);
                if (topSourceDirs.includes(sourceDir)) {
                    finalScore *= 1.1;
                }
                finalScores[source] = finalScore;
            });

            const finalSorted = Object.entries(finalScores).sort(([, a], [, b]) => b - a);

            console.log('\nMost relevant source files (by weighted score):');
            finalSorted.slice(0, 25).forEach(([source, score]) => {
                console.log(`- ${source} (Score: ${score.toFixed(0)})`);
            });

            if (finalSorted.length > 0) {
                console.log(`\nTop result: ${finalSorted[0][0]}`);
            } else {
                console.log('No relevant source files found after scoring.');
            }
        } else {
            console.log('No results found for your query and type.');
        }
    }
}

QueryKnowledgeBase.run(opts.query, opts.type).catch(err => {
    console.error(err);
    process.exit(1);
});
```

As you can see, there is no hidden magic. The entire engine is just a series of logical steps: parsing content into a
standard format, enriching it with metadata, and using a vector database to find the most relevant information.
This transparency is the essence of the AI-Native approach. It’s a system designed not just to be used, but to be
understood, extended, and improved upon. We invite you to dive in, experiment with the scripts, and imagine what you
can build on this foundation.
