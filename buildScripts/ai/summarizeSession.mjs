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
        const aggregatedContent = memories.documents.join('\\n\\n---\\n\\n');
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

        // 5. Generate summary
        const result = await model.generateContent(summaryPrompt);
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
                memoryCount: memories.ids.length,
                title,
                category,
                quality,
                productivity,
                impact,
                complexity,
                technologies: technologies.join(',') // Store as comma-separated string
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
