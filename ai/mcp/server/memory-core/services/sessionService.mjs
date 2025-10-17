import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../../../../../buildScripts/ai/aiConfig.mjs';

class SessionSummarizer {
    constructor() {
        const {host, port} = aiConfig.memory;
        this.dbClient = new ChromaClient({ host, port, ssl: false });

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI         = new GoogleGenerativeAI(GEMINI_API_KEY);
        this.model          = genAI.getGenerativeModel({model: 'gemini-1.5-flash'});
        this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.knowledgeBase.embeddingModel});

        this.memoryCollection   = null;
        this.sessionsCollection = null;
    }

    async initializeCollections() {
        const memoryConfig   = aiConfig.memory;
        const sessionsConfig = aiConfig.sessions;
        this.memoryCollection   = await this.dbClient.getCollection({ name: memoryConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        this.sessionsCollection = await this.dbClient.getOrCreateCollection({ name: sessionsConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
    }

    async findUnsummarizedSessions() {
        const memories = await this.memoryCollection.get({ include: ['metadatas'] });
        if (memories.ids.length === 0) return [];

        const sessionIds = [...new Set(memories.metadatas.map(m => m.sessionId))];
        const summaries = await this.sessionsCollection.get({ include: ['metadatas'] });
        const summarizedSessionIds = new Set(summaries.metadatas.map(m => m.sessionId));

        return sessionIds.filter(id => !summarizedSessionIds.has(id));
    }

    async summarizeSession(sessionId) {
        const memories = await this.memoryCollection.get({
            where: { sessionId: sessionId },
            include: ['documents', 'metadatas']
        });

        if (memories.ids.length === 0) return null;

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

Do not include any markdown formatting (e.g., \
json) in your response.

---

${aggregatedContent}
`;

        const result = await this.model.generateContent(summaryPrompt);
        const responseText = result.response.text();
        const summaryData = JSON.parse(responseText);

        const { summary, title, category, quality, productivity, impact, complexity, technologies } = summaryData;

        const summaryId       = `summary_${sessionId}`;
        const embeddingResult = await this.embeddingModel.embedContent(summary);
        const embedding       = embeddingResult.embedding.values;

        await this.sessionsCollection.upsert({
            ids: [summaryId],
            embeddings: [embedding],
            metadatas: [{
                sessionId, timestamp: new Date().toISOString(), memoryCount: memories.ids.length,
                title, category, quality, productivity, impact, complexity, technologies: technologies.join(',')
            }],
            documents: [summary]
        });

        return { sessionId, summaryId, title, memoryCount: memories.ids.length };
    }
}

export async function summarizeSessions({ sessionId }) {
    const summarizer = new SessionSummarizer();
    await summarizer.initializeCollections();
    let processed = [];

    if (sessionId) {
        const result = await summarizer.summarizeSession(sessionId);
        if (result) processed.push(result);
    } else {
        const sessionsToSummarize = await summarizer.findUnsummarizedSessions();
        for (const id of sessionsToSummarize) {
            const result = await summarizer.summarizeSession(id);
            if (result) processed.push(result);
        }
    }
    return { processed: processed.length, sessions: processed };
}
