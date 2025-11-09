# The Context Engineering Revolution: How We Built a Self-Aware Development Environment

*From shell scripts to a multi-server architecture, Neo.mjs v11 marks a pivotal moment in our journey toward a truly AI-native development experience.*

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/ContextEngineering.jpg" alt="Cover Image" class="blog-image">

Just a few weeks ago, we introduced the concept of an **[AI-Native, Not AI-Assisted](https://github.com/neomjs/neo/blob/dev/learn/blog/ai-native-platform-answers-questions.md)** development platform. We argued that for AI to be a true partner, it needs a development environment that is transparent, queryable, and designed for collaboration. We launched this vision with a local AI Knowledge Base and a formal AI Agent Protocol (`AGENTS.md`), powered by a suite of simple shell scripts.

Today, with the release of **[Neo.mjs v11.0.0](https://github.com/neomjs/neo/blob/dev/.github/RELEASE_NOTES/v11.0.0.md)**, we are taking a giant leap forward. This release represents **six weeks of intensive development** that resolved **388 tickets**—a velocity that demonstrates the power of true human-AI collaboration. With a core team that's primarily one person, this kind of output would have been impossible without the AI-native infrastructure we've built.

This isn't just an upgrade; it's the next stage in a new paradigm we call **Context Engineering**.

## The Problem with Scripts: The Limits of "Good Enough"

Our initial AI tooling was a powerful proof of concept. It worked. An AI agent could query the local knowledge base, get context, and write code. But as we pushed the boundaries of what was possible, the limitations of a script-based approach became clear:

1.  **Brittleness:** Shell scripts are notoriously fragile. A small change in the output of one script could break the entire chain.
2.  **Agent-Specific:** The scripts were designed with a specific agent in mind (Gemini CLI). This limited our ability to work with other agents, like Claude or custom-built tools.
3.  **Complexity:** The agent's setup protocol was complex, requiring a series of manual steps to get started.
4.  **Lack of Persistence:** The agent had no memory. Every session was a blank slate, forcing it to relearn the same things over and over.

We realized that to build a truly self-aware development environment, we needed to move beyond scripts and embrace a more robust, scalable, and persistent architecture.

## The Solution: A Multi-Server Model Context Protocol (MCP) Architecture

Neo.mjs v11 introduces three dedicated **Model Context Protocol (MCP)** servers, each designed to handle a specific aspect of the AI-native development workflow:

1.  **The Knowledge Base Server:** This server provides the AI with a deep, semantic understanding of the framework's source code, documentation, and historical tickets. It's the AI's "long-term memory" of the project's technical details.
2.  **The Memory Core Server:** This is the AI's personal memory. It allows the agent to recall past conversations, decisions, and outcomes, enabling it to learn from experience and improve over time.
3.  **The GitHub Workflow Server:** The crown jewel of our new tooling. This server provides robust, bi-directional synchronization for GitHub issues and release notes, storing them as local markdown files. This enables agents (and humans) to interact with them as part of the local knowledge base while ensuring everything stays in sync with GitHub. It automates the entire issue and pull request lifecycle, empowering the agent to participate directly in the development workflow.

This new architecture is defined directly within the agent's settings, making the tools available for any task:

```json
{
    "mcpServers": {
        "chrome-devtools": {
            "command": "npx",
            "args"   : ["-y", "chrome-devtools-mcp@latest"]
        },
        "neo.mjs-github-workflow": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-github-workflow"]
        },
        "neo.mjs-knowledge-base": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-knowledge-base"]
        },
        "neo.mjs-memory-core": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-memory-core"]
        }
    }
}
```

### The Backbone: The Model Context Protocol (MCP)

At the heart of our new architecture is the **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro)**, an open standard for communication between AI agents and development tools. Think of it as a **universal USB-C port for AI**, allowing any AI—whether it's Gemini, Claude, or a custom-built agent—to securely and reliably connect with a developer's local environment.

By adopting the official MCP SDK for all three of our servers, we gain several key advantages:

1.  **Agent Agnosticism:** We are no longer tied to a specific AI provider. Any agent that can "speak" MCP can now connect to our development environment, giving us the flexibility to choose the best tool for the job.
2.  **Standardization:** MCP provides a clear, well-defined structure for how tools are defined, called, and how they return data. This eliminates the guesswork and fragility of parsing unstructured shell script output.
3.  **Security:** MCP is designed with security in mind, providing a safe and controlled way for an AI to interact with local files and processes.

## The Knowledge Base Server: OpenAPI-Driven Self-Documentation

The Knowledge Base server is where we've pushed the boundaries of what's possible with MCP. Rather than hardcoding tool definitions in JavaScript, we've built a system that's **entirely driven by OpenAPI 3 specifications**.

### The OpenAPI Innovation

Here's the key insight: **OpenAPI is a language-agnostic specification that can describe both MCP tools AND REST APIs**. By using OpenAPI as our single source of truth, we've created a system that's incredibly flexible and maintainable.

Let's look at how a tool is defined in `openapi.yaml`:

```yaml
paths:
  /documents/query:
    post:
      summary: Query Documents
      operationId: query_documents
      x-pass-as-object: true
      x-annotations:
        readOnlyHint: true
      description: |
        Performs a semantic search on the knowledge base using a natural 
        language query. Returns a scored and ranked list of the most 
        relevant source files.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - query
              properties:
                query:
                  type: string
                  description: Natural language search query (1-10 words work best)
                type:
                  type: string
                  enum: [all, blog, guide, src, example, ticket, release]
                  default: all
      responses:
        '200':
          description: Successfully retrieved query results
          content:
            application/json:
              schema:
                type: object
                properties:
                  topResult:
                    type: string
                  results:
                    type: array
                    items:
                      type: object
                      properties:
                        source:
                          type: string
                        score:
                          type: string
```

Notice the custom extensions:
- **`x-pass-as-object`**: Tells the tool service to pass arguments as a single object rather than positional parameters
- **`x-annotations`**: Provides hints to AI agents about tool behavior (readOnly, destructive, etc.)

### Dynamic Tool Generation

The magic happens in `toolService.mjs`, which reads this OpenAPI specification at startup and automatically generates:

1. **Zod validation schemas** for runtime type checking
2. **JSON Schema** definitions for MCP tool discovery
3. **Argument mapping** for service handler invocation

Here's a simplified view of how this works:

```javascript
function initializeToolMapping() {
    const openApiDocument = yaml.load(fs.readFileSync(openApiFilePath, 'utf8'));
    
    for (const pathItem of Object.values(openApiDocument.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId) {
                // Build Zod schema from OpenAPI definition
                const inputZodSchema = buildZodSchema(openApiDocument, operation);
                
                // Convert to JSON Schema for MCP clients
                const inputJsonSchema = zodToJsonSchema(inputZodSchema, {
                    target: 'openApi3',
                    $refStrategy: 'none'
                });
                
                // Store tool definition
                toolMapping[operation.operationId] = {
                    name: operation.operationId,
                    zodSchema: inputZodSchema,
                    handler: serviceMapping[operation.operationId],
                    // ... other metadata
                };
            }
        }
    }
}
```

This approach has profound implications:

**1. Tools are self-documenting** - The OpenAPI spec IS the documentation. AI agents can introspect tool schemas dynamically.

**2. Multi-protocol support** - With minimal effort, we could expose these same tools as a REST API by spinning up an Express server that reads the same OpenAPI file.

**3. Type safety at runtime** - Every tool call is validated against its Zod schema before execution, catching errors early with clear messages.

**4. Maintainability** - Changes to tool signatures happen in one place (the YAML file), and everything else updates automatically.

### The Self-Aware Startup Sequence

One of the most powerful features of the Knowledge Base server is its **autonomous startup synchronization**. The server doesn't just wait passively for commands—it actively ensures the knowledge base is current before accepting any queries.

Here's the startup flow from `DatabaseService.mjs`:

```javascript
async initAsync() {
    await super.initAsync();
    
    // Wait for ChromaDB to be available
    await DatabaseLifecycleService.ready();
    
    logger.info('[Startup] Checking knowledge base status...');
    const knowledgeBasePath = aiConfig.dataPath;
    const kbExists = await fs.pathExists(knowledgeBasePath);
    
    try {
        if (!kbExists) {
            logger.info('[Startup] Knowledge base file not found. Starting full synchronization...');
            await this.syncDatabase();
            logger.info('✅ [Startup] Full synchronization complete.');
        } else {
            logger.info('[Startup] Knowledge base file found. Starting embedding process...');
            await this.embedKnowledgeBase();
            logger.info('✅ [Startup] Embedding process complete.');
        }
    } catch (error) {
        logger.warn('⚠️  [Startup] Knowledge base synchronization/embedding failed:', error.message);
    }
}
```

This means:
- **Zero manual setup** - The agent starts the server, and it "just works"
- **Always current** - Changes to source code are automatically detected and embedded
- **Graceful degradation** - If sync fails, the server starts anyway, failing gracefully at the tool level with helpful error messages

### Intelligent Health Monitoring

The `HealthService` is designed around a simple principle: **fail fast with actionable guidance**. Rather than letting tool calls fail with cryptic database errors, the health service acts as a gatekeeper.

Here's how `ensureHealthy()` works:

```javascript
async ensureHealthy() {
    const health = await this.healthcheck();
    
    if (health.status !== 'healthy') {
        const details = health.details.join('\n  - ');
        const statusMsg = health.status === 'unhealthy' 
            ? 'not available' 
            : 'not fully operational';
        throw new Error(`Knowledge Base is ${statusMsg}:\n  - ${details}`);
    }
}
```

When a tool handler calls this method, it gets immediate, clear feedback:

```
Knowledge Base is not available:
  - ChromaDB is not accessible at localhost:8000. Please start ChromaDB or use the start_database tool.
```

The service also implements **intelligent caching** with a 5-minute TTL for healthy results, while unhealthy results are never cached. This means:
- **Low overhead** - Multiple tools can check health without hammering ChromaDB
- **Immediate recovery detection** - When you fix an issue (like starting ChromaDB), the next check sees it immediately

### The Query Scoring Algorithm: Beyond Simple Vector Search

The most sophisticated part of the Knowledge Base server is its **hybrid query scoring system**. While most vector databases rely purely on cosine similarity, our system combines semantic embeddings with intelligent keyword matching and structural analysis.

Here's how it works in `QueryService.mjs`:

**Step 1: Semantic Search**
```javascript
const queryEmbedding = await model.embedContent(query);
const results = await collection.query({
    queryEmbeddings: [queryEmbedding.embedding.values],
    nResults: aiConfig.nResults
});
```

**Step 2: Keyword-Based Boosting**
```javascript
const queryWords = queryLower
    .replace(/[^a-zA-Z ]/g, '')
    .split(' ')
    .filter(w => w.length > 2);

results.metadatas[0].forEach((metadata, index) => {
    let score = (results.metadatas[0].length - index) * queryScoreWeights.baseIncrement;
    
    queryWords.forEach(queryWord => {
        const keyword = queryWord;
        const keywordSingular = keyword.endsWith('s') 
            ? keyword.slice(0, -1) 
            : keyword;
        
        if (keywordSingular.length > 2) {
            // Path matching - highest weight
            if (sourcePathLower.includes(`/${keywordSingular}/`)) 
                score += queryScoreWeights.sourcePathMatch; // +40
            
            // Filename matching
            if (fileName.includes(keywordSingular)) 
                score += queryScoreWeights.fileNameMatch; // +30
            
            // Class name matching
            if (metadata.className?.toLowerCase().includes(keywordSingular)) 
                score += queryScoreWeights.classNameMatch; // +20
            
            // Content type bonuses
            if (metadata.type === 'guide') 
                score += queryScoreWeights.guideMatch; // +50
        }
    });
});
```

**Step 3: Inheritance Chain Propagation**

This is where it gets really interesting. When you query for a component, you probably also want to know about its parent classes. The system automatically propagates relevance up the inheritance chain:

```javascript
const inheritanceChain = JSON.parse(metadata.inheritanceChain || '[]');
let boost = queryScoreWeights.inheritanceBoost; // 80 points

inheritanceChain.forEach(parent => {
    if (parent.source) {
        sourceScores[parent.source] = (sourceScores[parent.source] || 0) + boost;
    }
    boost = Math.floor(boost * queryScoreWeights.inheritanceDecay); // 0.6 decay
});
```

So if you search for "Button component" and find `button.Button`, you'll also get boosted results for:
- `component.Base` (+80 points)
- `core.Base` (+48 points)
- Any other parent classes with diminishing relevance

**Step 4: Type-Based Penalties and Bonuses**

The system understands that not all content types are equally relevant:

```javascript
// Closed tickets are historical context - penalize unless explicitly requested
if (metadata.type === 'ticket' && type === 'all') 
    score += queryScoreWeights.ticketPenalty; // -70

// Release notes are usually too broad unless you're searching for a specific version
if (metadata.type === 'release') 
    score += queryScoreWeights.releasePenalty; // -50

// Base classes are often the best documentation
if (fileName.endsWith('base.mjs')) 
    score += queryScoreWeights.baseFileBonus; // +20

// Exact version match on release notes gets massive boost
if (metadata.type === 'release' && queryLower.startsWith('v') && nameLower === queryLower) 
    score += queryScoreWeights.releaseExactMatch; // +1000
```

The result is a query system that "thinks" like a developer. It understands that:
- Implementation code (`src`) and guides are more relevant than blog posts (which may have outdated code)
- Parent classes provide important context for understanding child classes
- Base classes often contain the best documentation
- Closed tickets are historical unless you're specifically researching an issue
- Exact version matches on release notes should always be top results

### The ETL Pipeline: From Source to Vectors

The knowledge base synchronization process is a sophisticated ETL (Extract, Transform, Load) pipeline that runs automatically on startup:

**Extract Phase** (`createKnowledgeBase`):
```javascript
// 1. Process JSDoc API data
const apiData = await fs.readJson('docs/output/all.json');
apiData.forEach(item => {
    if (item.kind === 'class') {
        chunk = {
            type: 'src',
            kind: 'class',
            name: item.longname,
            description: item.comment,
            extends: item.augments?.[0],
            source: sourceFile
        };
    }
    // ... methods, configs, etc.
});

// 2. Process Markdown learning content
const learnTree = await fs.readJson('learn/tree.json');
// ... parse and chunk markdown files

// 3. Process Release Notes
// 4. Process Ticket Archives
```

**Transform Phase** (in-memory enrichment):
```javascript
// Build inheritance chains for every chunk
const classNameToDataMap = {};
knowledgeBase.forEach(chunk => {
    if (chunk.kind === 'class') {
        classNameToDataMap[chunk.name] = { 
            source: chunk.source, 
            parent: chunk.extends 
        };
    }
});

knowledgeBase.forEach(chunk => {
    const inheritanceChain = [];
    let currentClass = chunk.className;
    
    while (currentClass && classNameToDataMap[currentClass]?.parent) {
        const parentClassName = classNameToDataMap[currentClass].parent;
        inheritanceChain.push({ 
            className: parentClassName, 
            source: classNameToDataMap[parentClassName].source 
        });
        currentClass = parentClassName;
    }
    
    chunk.inheritanceChain = inheritanceChain;
});
```

**Load Phase** (`embedKnowledgeBase`):
```javascript
// Smart diffing - only embed what changed
const existingDocsMap = new Map();
existingDocs.ids.forEach((id, index) => {
    existingDocsMap.set(id, existingDocs.metadatas[index].hash);
});

const chunksToProcess = [];
knowledgeBase.forEach((chunk, index) => {
    const chunkId = `id_${index}`;
    if (!existingDocsMap.has(chunkId) || 
        existingDocsMap.get(chunkId) !== chunk.hash) {
        chunksToProcess.push({ ...chunk, id: chunkId });
    }
});

// Batch embedding with retry logic
for (let i = 0; i < chunksToProcess.length; i += batchSize) {
    const batch = chunksToProcess.slice(i, i + batchSize);
    const result = await model.batchEmbedContents({
        requests: batch.map(chunk => ({
            model: aiConfig.embeddingModel,
            content: { parts: [{ text: `${chunk.type}: ${chunk.name}...` }] }
        }))
    });
    
    await collection.upsert({
        ids: batch.map(chunk => chunk.id),
        embeddings: result.embeddings.map(e => e.values),
        metadatas: batch.map(toMetadata)
    });
}
```

This design is intentionally memory-intensive at sync time to make queries lightning-fast. By pre-calculating inheritance chains and content hashes during the load phase, we avoid expensive computations during every query.

### The Memory Core: An Agent's Personal History

If the Knowledge Base is the AI's understanding of the *project*, the **Memory Core** is its understanding of *itself*. It's the agent's personal, persistent memory, transforming it from a stateless tool into a true collaborator that learns from experience.

Every interaction—every prompt, thought process, and response—is captured and stored as a "memory." This is not just a chat log; it's a structured, queryable history of the agent's own work. When a new session begins, the Memory Core automatically analyzes and summarizes all previous, unsummarized sessions. This creates a high-level "recap" of past work, allowing the agent to remember what it did, what decisions it made, and why.

This capability is critical for several reasons:

1.  **Learning & Self-Correction:** By querying its own history, the agent can identify patterns in its work, recall past solutions to similar problems, and avoid repeating mistakes. It can ask itself, "How did I solve that bug last week?" and get a concrete answer from its own experience.
2.  **Contextual Continuity:** An agent with memory can maintain context across days or even weeks. It can pick up a complex refactoring task exactly where it left off, without needing to be re-briefed on the entire history.
3.  **Performance Analysis:** The session summaries include metrics on quality, productivity, and complexity. This allows us (and the agent itself) to analyze its performance over time, identifying areas for improvement in its own problem-solving strategies.
4.  **Transactional Integrity:** The protocol for saving memories is transactional and mandatory. The agent *must* save a consolidated record of its entire turn (prompt, thought, response) before delivering its final answer. This "save-then-respond" loop, enforced by the `add_memory` tool, guarantees that no experience is ever lost, creating a rich and honest record of the entire problem-solving process.

The Memory Core is the foundation for an agent that doesn't just execute tasks, but grows, learns, and improves with every interaction. It's the key to building a partner that truly understands the long-term narrative of the project.

## The GitHub Workflow Server: Closing the Loop

While the Knowledge Base provides context and the Memory Core provides continuity, the **GitHub Workflow Server** closes the loop by giving the agent the ability to *act* on the development workflow itself.

This server provides:
- **Bi-directional sync** of GitHub issues and PRs as local markdown files
- **GraphQL API integration** for fast, reliable GitHub operations
- **Automated PR lifecycle management** from creation to merge
- **Local-first workflow** where agents work with files, not APIs

We'll dive deep into this server in a future section, but the key insight is that by representing GitHub issues as local markdown files that are part of the knowledge base, we've made the entire project backlog *queryable* and *actionable* for AI agents.

## The Benefits of a Server-Based Approach

This shift to a multi-server architecture brings a host of benefits:

-   **Robustness and Reliability:** Servers are more resilient than scripts, with better error handling and a more stable API.
-   **Agent-Agnosticism:** Any AI agent that can speak the MCP language can now connect to our development environment.
-   **Self-Hosting:** In a powerful demonstration of "dogfooding," the MCP servers themselves are built using the `Neo.mjs` class system. This showcases the framework's versatility for creating robust, scalable backend and CLI applications.
-   **Simplified Onboarding:** The servers now manage their own database startup and session summarization automatically. This drastically simplifies the agent onboarding process, reducing the agent's setup protocol by over 70%.
-   **Self-Documenting Tools:** The MCP tools are now self-documenting, allowing agents to dynamically inspect tool capabilities and schemas, making the entire system more resilient and easier to extend.

## Agent-Driven Quality: The Final Piece of the Puzzle

A self-aware development environment is only as good as the quality of the code it produces. To that end, we have completed the migration of our entire unit test suite from the browser-based Siesta to the Node.js-based Playwright runner.

This is a game-changer. For the first time, AI agents can now run `npm test` to validate their own changes. This is a critical step toward a fully autonomous, quality-driven development loop and a prerequisite for future CI/CD integration.

## The Numbers Tell the Story

Let's put the velocity of this release into perspective:

- **6 weeks of development**
- **388 resolved tickets**
- **3 new MCP servers** with full OpenAPI specifications
- **30+ test suites** migrated to Playwright
- **52 pull requests** from the community
- **20+ contributors** during Hacktoberfest

For a team that's primarily one person, these numbers are extraordinary. They demonstrate what becomes possible when you build development tools that genuinely augment human capability rather than just automating simple tasks.

The AI didn't write all this code—but it made it possible to *coordinate* this level of complexity, to *maintain consistency* across hundreds of changes, and to *catch regressions* before they shipped.

## A Community-Powered Revolution

This monumental release would not have been possible without the incredible energy and contributions from our community, especially during **Hacktoberfest 2025**. We received over 52 pull requests from more than 20 contributors, a new record for the project.

Our heartfelt thanks go out to:
Aki-07, Ayush Kumar, Chisaneme Aloni, Emmanuel Ferdman, Ewelina Bierć, KURO-1125, LemonDrop847, Mahita07, MannXo, Mariam Saeed, Nallana Hari Krishna, Nitin Mishra, PrakhyaDas, Ritik Mehta, Sanjeev Kumar, Sarthak Jain, ad1tyayadav, cb-nabeel, kart-u, nikeshadhikari9, srikanth-s2003.

<img width="941" height="560" alt="Screenshot 2025-10-27 at 15 14 32" src="https://github.com/user-attachments/assets/4d7d75d7-b2ff-4811-89f3-c167e620783d" />

## The Future is Self-Aware

The release of Neo.mjs v11 is not just about new features; it's about a new way of thinking about software development. It's about building a development environment that is not just "AI-assisted," but truly **AI-native**. It's about creating a system that is self-aware, self-documenting, and self-improving.

This is the essence of **Context Engineering**. It's the art and science of building systems that can understand their own context and use that understanding to improve themselves.

We are just at the beginning of this journey. The road ahead is long, but the destination is clear: a future where human and machine collaborate to build better, faster, and more maintainable software.

We invite you to join us. Fork the repository, explore the new MCP servers, and start a conversation with our AI-native platform. The future of frontend development is here, and it's more intelligent than you can imagine.

---

*Want to dive deeper? Check out our [Working with Agents](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md) guide and the [AI Quick Start](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md) to get started with the new MCP architecture.*
