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
    .name('neo-ai-query-memory')
    .version('1.0.0')
    .requiredOption('-q, --query <value>', 'The search query for the memory base')
    .option('-n, --n-results <value>', 'The number of results to return', 10)
    .parse(process.argv);

const opts = program.opts();

/**
 * @summary Queries the AI agent's persistent memory stored in ChromaDB.
 *
 * This script is the core of the agent's recall ability. It takes a natural language query,
 * converts it into a vector embedding, and performs a semantic search against the
 * `neo-agent-memory` collection to find the most relevant past interactions.
 *
 * @see {@link .github/ISSUE/ticket-create-memory-query-tool.md}
 */
class QueryMemory {
    static async run(query, nResults) {
        console.log(`Querying agent memory for: "${query}"
`);

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

        // 3. Generate query embedding and perform search
        const queryEmbedding = await model.embedContent(query);

        const results = await collection.query({
            queryEmbeddings: [queryEmbedding.embedding.values],
            nResults       : parseInt(nResults, 10)
        });

        // 4. Process and display results
        if (results.ids[0].length > 0) {
            console.log('Most relevant memories found:\n');
            results.ids[0].forEach((id, index) => {
                const metadata = results.metadatas[0][index];
                const distance = results.distances[0][index];
                console.log(`----------------------------------------`);
                console.log(`Memory ID: ${id}`);
                console.log(`Timestamp: ${metadata.timestamp}`);
                console.log(`Session ID: ${metadata.sessionId}`);
                console.log(`Distance: ${distance.toFixed(4)}`);
                console.log(`\n--- Prompt ---\n${metadata.prompt}`);
                console.log(`\n--- Thought ---\n${metadata.thought}`);
                console.log(`\n--- Response ---\n${metadata.response}`);
                console.log(`----------------------------------------\n`);
            });
        } else {
            console.log('No relevant memories found for your query.');
        }
    }
}

QueryMemory.run(opts.query, opts.nResults).catch(err => {
    console.error('Error querying memory:', err);
    process.exit(1);
});
