import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import {Command}            from 'commander/esm.mjs';
import aiConfig             from './aiConfig.mjs';
import dotenv               from 'dotenv';
import path                 from 'path';

// Load environment variables
const cwd = process.cwd();
const insideNeo = process.env.npm_package_name.includes('neo.mjs');
dotenv.config({ path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'), quiet: true });

const program = new Command();

program
    .name('neo-ai-summarize-session')
    .version(process.env.npm_package_version)
    .option('-s, --session-id <value>', 'The ID of the session to summarize')
    .parse(process.argv);

const opts = program.opts();

/**
 * @summary Summarizes agent sessions and stores the summaries in a dedicated database.
 *
 * This script implements the first step of a two-tiered memory system. It can operate in two modes:
 * 1.  **Single Session Mode:** If a `--session-id` is provided, it retrieves all memories for that
 *     specific session, uses a generative model to create a high-level summary, and then persists
 *     that summary to a `sessions` collection.
 * 2.  **Batch Mode:** If no `--session-id` is provided, it automatically finds all sessions that
 *     have not yet been summarized, and processes each one sequentially.
 *
 * This creates a fast, searchable index of past work.
 *
 * @see {@link https://github.com/neomjs/neo/issues/7325}
 * @see {@link https://github.com/neomjs/neo/issues/7358}
 */
class SummarizeSession {
    constructor() {
        // Initialize clients and model once
        const {host, port} = aiConfig.memory;
        this.dbClient = new ChromaClient({ host, port, ssl: false });

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI         = new GoogleGenerativeAI(GEMINI_API_KEY);
        this.model          = genAI.getGenerativeModel({model: 'gemini-2.5-flash'});
        this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.knowledgeBase.embeddingModel});

        this.memoryCollection   = null;
        this.sessionsCollection = null;
    }

    async initializeCollections() {
        const memoryConfig   = aiConfig.memory;
        const sessionsConfig = aiConfig.sessions;
        try {
            this.memoryCollection   = await this.dbClient.getCollection({ name: memoryConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
            this.sessionsCollection = await this.dbClient.getOrCreateCollection({ name: sessionsConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        } catch (err) {
            console.error(`Could not connect to collections. Please ensure the memory server is running (\`npm run ai:server-memory\`).`);
            throw err; // Re-throw to stop execution
        }
    }

    async findUnsummarizedSessions() {
        console.log('Searching for unsummarized sessions...');

        // 1. Retrieve all memories
        const memories = await this.memoryCollection.get({
            include: ['metadatas']
        });

        if (memories.ids.length === 0) {
            console.log('No memories found.');
            return [];
        }

        // 2. Get all unique session IDs from memories
        const sessionIds = [...new Set(memories.metadatas.map(m => m.sessionId))];

        // 3. Get all existing summary IDs
        const summaries = await this.sessionsCollection.get({
            include: ['metadatas']
        });
        const summarizedSessionIds = new Set(summaries.metadatas.map(m => m.sessionId));

        // 4. Filter out sessions that are already summarized
        const unsummarized = sessionIds.filter(id => !summarizedSessionIds.has(id));

        console.log(`Found ${unsummarized.length} unsummarized session(s).`);
        return unsummarized;
    }

    async summarizeSession(sessionId) {
        console.log(`\n--- Summarizing session: ${sessionId} ---`);

        // 1. Retrieve all memories for the session
        const memories = await this.memoryCollection.get({
            where  : { sessionId: sessionId },
            include: ['documents', 'metadatas']
        });

        if (memories.ids.length === 0) {
            console.log('No memories found for this session ID.');
            return;
        }

        console.log(`Found ${memories.ids.length} memories to summarize.`);

        // 2. Aggregate content for summarization
        const aggregatedContent = memories.documents.join('\n\n---\n\n');
        const summaryPrompt = `
Analyze the following development session and provide a structured summary in JSON format. The JSON object should have the following properties:

- "summary": (String) A detailed summary of the session. Identify the main goal, key decisions, modified code, and the final outcome.
- "title": (String) A concise, descriptive title for the session (max 10 words).
- "category": (String) Classify the task into one of the following: 'bugfix', 'feature', 'refactoring', 'documentation', 'new-app', 'analysis', 'other'.
- "quality": (Number) A score from 0-100 rating the session's flow and focus. 100 is a perfect, focused session. 0 is a completely derailed or useless session.
- "productivity": (Number) A score from 0-100 indicating if the session's primary goals were achieved. 100 means all goals were met. 0 means no goals were met.
- "impact": (Number) A score from 0-100 estimating the significance of the changes made. 100 is a critical, high-impact change. 0 is a trivial or no-impact change.
- "complexity": (Number) A score from 0-100 rating the task's complexity based on factors like file touchpoints, depth of changes (core vs. app-level), and cognitive load. A simple typo fix is < 10. A deep refactoring of a core module is > 90.
- "technologies": (String[]) An array of key technologies, frameworks, or libraries involved (e.g., "neo.mjs", "chromadb", "nodejs").

Do not include any markdown formatting (e.g., \`\`\`json) in your response.

---

${aggregatedContent}
`;

        // 3. Generate summary
        const result = await this.model.generateContent(summaryPrompt);
        const responseText = result.response.text();
        let summaryData;

        try {
            summaryData = JSON.parse(responseText);
        } catch (err) {
            console.error('Error parsing JSON response from model:', err);
            console.log('--- Raw Response ---');
            console.log(responseText);
            console.log('--------------------');
            return;
        }

        const { summary, title, category, quality, productivity, impact, complexity, technologies } = summaryData;

        console.log(`\n--- Generated Summary ---
Title: ${title}
Category: ${category}
Quality: ${quality}/100
Productivity: ${productivity}/100
Impact: ${impact}/100
Complexity: ${complexity}/100
Technologies: ${technologies.join(', ')}
---
${summary}
-------------------------
`);

        // 4. Store summary in the sessions collection
        const summaryId       = `summary_${sessionId}`;
        const embeddingResult = await this.embeddingModel.embedContent(summary);
        const embedding       = embeddingResult.embedding.values;

        await this.sessionsCollection.upsert({
            ids: [summaryId],
            embeddings: [embedding],
            metadatas: [{
                sessionId   : sessionId,
                timestamp   : new Date().toISOString(),
                memoryCount : memories.ids.length,
                title,
                category,
                quality,
                productivity,
                impact,
                complexity,
                technologies: technologies.join(',')
            }],
            documents: [summary]
        });

        console.log(`Successfully saved summary for session ${sessionId} to collection "${aiConfig.sessions.collectionName}".`);
    }

    async run(sessionId) {
        await this.initializeCollections();

        if (sessionId) {
            await this.summarizeSession(sessionId);
        } else {
            const sessionsToSummarize = await this.findUnsummarizedSessions();
            for (const id of sessionsToSummarize) {
                await this.summarizeSession(id);
            }
        }
    }
}

const summarizer = new SummarizeSession();
summarizer.run(opts.sessionId).catch(err => {
    console.error('Error summarizing session(s):', err);
    process.exit(1);
});
