# AI-Native, Not AI-Assisted: A Platform That Answers Your Questions

*Inside the conversational code architecture of Neo.mjs and how it's changing the developer experience for Hacktoberfest and beyond.*

The next great leap in frontend development will not be a new rendering pattern or state management library. It will be a fundamental shift in our partnership with artificial intelligence. For too long, we've treated AI as a clever autocomplete—a helpful but limited assistant. What if, instead, we built development platforms that treated AI as a first-class partner? 

This is the question at the heart of Neo.mjs v10.7, the first release to be architected from the ground up for an **AI-Native** future. 

This isn't about bolting on a chatbot. It's about a new development model where the platform itself is designed to be understood, queried, and even enhanced by AI. At the core of this new experience are two key innovations: a comprehensive, local **AI Knowledge Base** and a formalized **AI Agent Protocol** (`AGENTS.md`).

Together, they transform the developer experience from a monologue of reading docs into a dialogue with the platform itself.

## The Problem with "AI-Assisted" Development

Current AI coding tools are powerful, but they operate with one hand tied behind their back. When interacting with traditional frontend frameworks, they face significant challenges:

1.  **Outdated Knowledge:** An AI's training data is a snapshot of the past. It doesn't know about your project's specific conventions, the latest API changes, or the nuances of your architecture. This leads to well-intentioned but incorrect or outdated code suggestions—the dreaded "AI hallucination."
2.  **Complex, Unpredictable Codebases:** Frameworks that rely on complex templating languages (like JSX) or highly abstracted component models create a codebase that is difficult for an AI to parse and understand safely. The patterns are often inconsistent, making it hard for an AI to generate code that "fits in."
3.  **A One-Way Street:** The interaction is purely extractive. The AI gives you code, but it learns nothing in the process. It cannot improve its understanding of your project, and it cannot contribute to the project's long-term health.

This "AI-Assisted" model leaves the developer with the full burden of validating the AI's output, teaching it the project's rules, and manually updating it on new patterns. It's helpful, but it's not a true partnership.

## The Neo.mjs AI-Native Architecture

Neo.mjs flips this model on its head. Instead of asking the AI to learn a complex and opaque system, we've built a platform that is transparent, queryable, and designed for AI collaboration from its very foundation. This architecture stands on four pillars:

### 1. The Local AI Knowledge Base

At the heart of our AI-native approach is a powerful, local knowledge base built on a suite of simple scripts (`createKnowledgeBase.mjs`, `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`). Here's how it works:

-   **Comprehensive:** It indexes the *entire* project—not just documentation, but all source code, JSDoc comments, and even our blog posts.
-   **Vectorized for Meaning:** Using the `text-embedding-004` model via your own private API key, it converts the entire knowledge base into semantic vectors and stores them locally in a ChromaDB database.
-   **Always Current:** Because it runs locally, it's always up-to-date with your latest code changes. The AI is querying the reality of your project *right now*, not the state of the world a year ago.

This transforms the AI from a source of generic advice into an expert on *your* specific codebase.

### 2. The `AGENTS.md` Protocol: A Constitution for AI

To ensure this power is used effectively and safely, we've introduced `AGENTS.md`—a file in our repository that acts as an operational manual, or a "constitution," for any AI agent interacting with the project. It enforces a simple but revolutionary rule:

**The Anti-Hallucination Policy: The AI MUST query the local knowledge base before writing any code.**

This query-first development model requires the AI to ask questions like:
- `npm run ai:query -- -q "show me examples for Neo.tab.Container"`
- `npm run ai:query -- -q "how are stores implemented?" -t guide`

By forcing the AI to learn from the project's ground truth, we eliminate hallucinations and ensure that all contributions adhere to existing patterns and conventions. It turns every interaction into a learning moment, creating a self-improving system where the AI gets smarter about your project over time.

### 3. The JSON Blueprint Advantage

Neo.mjs was architecturally ready for the AI revolution years before it happened. Unlike frameworks that use complex, proprietary templating languages, our platform uses simple JSON-like configuration objects to define component trees. 

We call this the "JSON Blueprint" advantage. For an AI, this is its native language. There is no complex syntax to learn, no ambiguity to parse. Generating a new component is as simple as creating a JavaScript object. This makes it incredibly easy and predictable for an AI to generate, manipulate, and reason about UI structures.

### 4. Multi-Threading for Unmatched Performance

Finally, the platform's unique multi-threaded architecture, where the application, VDOM, and data logic all run in separate web workers, provides the perfect environment for AI-driven development. Heavy operations, like asking an AI to generate a complex component or process a large amount of data, can be offloaded to a worker without ever blocking the main UI thread. This ensures the user experience remains fluid and responsive, no matter what the AI is doing in the background.

## What This Means for Developers & AI Tools

This AI-native architecture isn't just a theoretical advantage; it fundamentally changes the daily workflow for the better.

**For the Developer:**
-   **The Learning Curve is Eliminated:** Instead of spending weeks learning framework patterns, you can simply ask. New team members can become productive in hours, not months.
-   **Expert Guidance on Demand:** You have an instant expert by your side that can explain complex architectural patterns or find the exact example you need.
-   **Focus on What Matters:** With the AI handling the boilerplate and convention-checking, you can focus your energy on creative problem-solving and building great features.

**For AI Agents (like Gemini CLI or Claude Code):**
-   **A Seat at the Table:** AI tools are promoted from simple code completers to true development partners. They can operate with a high degree of autonomy because they have a reliable way to gather context and follow rules.
-   **Deterministic & Reliable Output:** Because the AI is grounded in the local knowledge base, its output is far more predictable and reliable. It generates code that is consistent with your project's style and patterns.
-   **A Path to Contribution:** For the first time, AI agents have a clear and safe path to not just write code, but to contribute to a project's long-term health by enhancing it with intent-driven comments and adhering to its established conventions.

## Your First AI-Powered PR: Get Involved this Hacktoberfest!

The era of AI-assisted coding is over. The era of AI-native development has begun. Neo.mjs is pioneering this new frontier, creating a platform where human and machine collaborate to build better, faster, and more maintainable web applications.

There has never been a better time to get involved in open source. With Hacktoberfest just around the corner, this is your opportunity to contribute to a truly innovative project. The AI-native architecture of Neo.mjs is designed to empower new contributors. You don't need to be an expert; you just need to be curious.

1.  **Fork the repository:** [https://github.com/neomjs/neo](https://github.com/neomjs/neo)
2.  **Follow the setup:** Get your local knowledge base running in minutes with our [AI Quick Start Guide](/.github/AI_QUICK_START.md).
3.  **Start a conversation:** Ask the platform a question. Find a small bug or a documentation gap. Use the AI as your partner to fix it.

We are actively creating new tickets of all difficulty levels for Hacktoberfest. Come join us, and let's build the future of frontend development together.

## Technical Deep Dive: Inside the Knowledge Base Engine

For those who want to see how the magic happens, the entire AI knowledge base engine is powered by three surprisingly simple Node.js scripts. This transparency is a core part of our philosophy. Here’s how they work.

### 1. `createKnowledgeBase.mjs`: The Parser

This is the first step in the pipeline. This script's only job is to read all the different source files (JSDoc JSON, Markdown guides, blog posts) and convert them into a single, consistent format. It breaks down classes, methods, and articles into logical "chunks" and streams them into a `dist/ai-knowledge-base.jsonl` file. The JSON Lines format is key here, as it allows the next script to process the data without having to load the entire file into memory.

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

This is the most computationally intensive step, and it's designed to be. It loads all the chunks from the previous step into memory to perform holistic analysis, like building a complete class inheritance map. It then enriches each chunk with this new metadata. Most importantly, it performs a **diff** against the existing database, identifying only the chunks that are new, have changed (by comparing content hashes), or have been deleted. Only the changed chunks are sent to the Gemini API to be converted into vector embeddings. Finally, it "upserts" these chunks into ChromaDB. By doing all the heavy lifting here, we make the final query step incredibly fast.

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

This is the script you interact with. It's designed to be extremely lightweight and fast. It takes your plain English query, sends it to the Gemini API to get a query vector, and then uses that vector to find the most semantically similar chunks in ChromaDB. It then applies a dynamic scoring algorithm, which gives boosts for keyword matches and, crucially, uses the pre-calculated inheritance chain to reward parent classes of relevant results. This hybrid approach of semantic search plus heuristic scoring gives incredibly relevant and accurate results.

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
