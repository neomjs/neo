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
    .name('neo-ai-add-memory')
    .version('1.0.0')
    .requiredOption('-p, --prompt <value>', 'The user prompt')
    .requiredOption('-r, --response <value>', 'The agent response')
    .requiredOption('-t, --thought <value>', 'The agent\'s thought process')
    .option('-s, --session-id <value>', 'The current session ID', `session_${Date.now()}`)
    .parse(process.argv);

const opts = program.opts();

/**
 * @summary Captures and stores a single AI agent memory into the ChromaDB memory collection.
 *
 * This script is the primary mechanism for making the agent stateful. It takes the core components
 * of an agent interaction (prompt, response, thoughts), creates a semantic vector embedding from them,
 * and persists them in the dedicated `neo-agent-memory` database.
 *
 * Each memory is stored as a document with rich metadata, including a timestamp and session ID,
 * allowing for future recall and analysis of the agent\'s history.
 *
 * @see {@link .github/ISSUE/ticket-create-memory-capture-api.md}
 */
class AddMemory {
    static async run(prompt, response, thought, sessionId) {
        console.log('Adding new agent memory...');

        // 1. Initialize clients
        const {host, port, collectionName} = aiConfig.memory;
        const dbClient = new ChromaClient({ host, port, ssl: false });

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: aiConfig.knowledgeBase.embeddingModel });

        // 2. Connect to the collection
        let collection;
        try {
            collection = await dbClient.getCollection({ name: collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        } catch (err) {
            console.error(`Could not connect to collection "${collectionName}". Please ensure the memory server is running (\`npm run ai:server-memory\`).`);
            return;
        }

        // 3. Prepare the memory document
        const combinedText = `User Prompt: ${prompt}\nAgent Thought: ${thought}\nAgent Response: ${response}`;
        const timestamp = new Date().toISOString();
        const memoryId = `mem_${timestamp}`;

        // 4. Generate embedding
        const embeddingResult = await model.embedContent(combinedText);
        const embedding = embeddingResult.embedding.values;

        // 5. Upsert into ChromaDB
        await collection.add({
            ids: [memoryId],
            embeddings: [embedding],
            metadatas: [{
                prompt,
                response,
                thought,
                sessionId,
                timestamp,
                type: 'agent-interaction'
            }],
            documents: [combinedText]
        });

        console.log(`Successfully added memory ${memoryId} to collection "${collectionName}".`);
    }
}

AddMemory.run(opts.prompt, opts.response, opts.thought, opts.sessionId).catch(err => {
    console.error('Error adding memory:', err);
    process.exit(1);
});
