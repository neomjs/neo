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
    .version('1.0.0')
    .requiredOption('-s, --session-id <value>', 'The ID of the session to summarize')
    .parse(process.argv);

const opts = program.opts();

/**
 * @summary Summarizes a given agent session and stores the summary in a dedicated database.
 *
 * This script implements the first step of a two-tiered memory system. It retrieves all
 * individual memories for a specific session, uses a generative model to create a
 * high-level summary, and then persists that summary to a `sessions` collection.
 * This creates a fast, searchable index of past work.
 *
 * @see {@link .github/ISSUE/ticket-create-session-summarization-api.md}
 */
class SummarizeSession {
    static async run(sessionId) {
        console.log(`Summarizing session: ${sessionId}...`);

        // 1. Initialize clients
        const memoryConfig = aiConfig.memory;
        const sessionsConfig = aiConfig.sessions;
        const dbClient = new ChromaClient({ host: memoryConfig.host, port: memoryConfig.port, ssl: false });

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Use a powerful model for summarization

        // 2. Get collections
        let memoryCollection, sessionsCollection;
        try {
            memoryCollection = await dbClient.getCollection({ name: memoryConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
            sessionsCollection = await dbClient.getOrCreateCollection({ name: sessionsConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        } catch (err) {
            console.error(`Could not connect to collections. Please ensure the memory server is running (\`npm run ai:server-memory\`).`);
            return;
        }

        // 3. Retrieve all memories for the session
        const memories = await memoryCollection.get({
            where: { sessionId: sessionId },
            include: ['documents', 'metadatas']
        });

        if (memories.ids.length === 0) {
            console.log('No memories found for this session ID.');
            return;
        }

        console.log(`Found ${memories.ids.length} memories to summarize.`);

        // 4. Aggregate content for summarization
        const aggregatedContent = memories.documents.join('\n\n---\n\n');
        const summaryPrompt = `Summarize the following development session. Identify the main goal, key decisions made, code that was modified, and the final outcome. Be concise and clear.\n\n---\n\n${aggregatedContent}`;

        // 5. Generate summary
        const result = await model.generateContent(summaryPrompt);
        const summary = result.response.text();

        console.log(`\n--- Generated Summary ---\n${summary}\n-------------------------\n`);

        // 6. Store summary in the sessions collection
        const summaryId = `summary_${sessionId}`;
        const embeddingResult = await genAI.getGenerativeModel({ model: aiConfig.knowledgeBase.embeddingModel }).embedContent(summary);
        const embedding = embeddingResult.embedding.values;

        await sessionsCollection.upsert({
            ids: [summaryId],
            embeddings: [embedding],
            metadatas: [{
                sessionId: sessionId,
                timestamp: new Date().toISOString(),
                memoryCount: memories.ids.length
            }],
            documents: [summary]
        });

        console.log(`Successfully saved summary for session ${sessionId} to collection "${sessionsConfig.collectionName}".`);
    }
}

SummarizeSession.run(opts.sessionId).catch(err => {
    console.error('Error summarizing session:', err);
    process.exit(1);
});
