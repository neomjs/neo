import {GoogleGenerativeAI}     from '@google/generative-ai';
import aiConfig                 from '../config.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import crypto                   from 'crypto';
import ChromaManager            from './ChromaManager.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import HealthService            from './HealthService.mjs';
import logger                   from '../logger.mjs';

/**
 * Service for handling adding, listing, and querying agent memories.
 * @class AI.mcp.server.memory-core.services.SessionService
 * @extends Neo.core.Base
 * @singleton
 */
class SessionService extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory-core.services.SessionService'
         * @protected
         */
        className: 'AI.mcp.server.memory-core.services.SessionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String|null} currentSessionId=crypto.randomUUID()
         * @protected
         */
        currentSessionId: crypto.randomUUID(),
        /**
         * @member {GoogleGenerativeAI|null} model_=null
         * @protected
         * @reactive
         */
        model_: null,
        /**
         * @member {GoogleGenerativeAI|null} embeddingModel_=null
         * @protected
         * @reactive
         */
        embeddingModel_: null,
        /**
         * @member {import('chromadb').Collection|null} memoryCollection_=null
         * @protected
         * @reactive
         */
        memoryCollection_: null,
        /**
         * @member {import('chromadb').Collection|null} sessionsCollection_=null
         * @protected
         * @reactive
         */
        sessionsCollection_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        logger.info(`[SessionService] Initialized new session: ${this.currentSessionId}`);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            logger.warn('⚠️  [Startup] GEMINI_API_KEY not set - skipping automatic session summarization');
            logger.warn('    Set GEMINI_API_KEY environment variable to enable summarization features');
            HealthService.recordStartupSummarization('skipped', { reason: 'GEMINI_API_KEY not set' });
            return;
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        this.model          = genAI.getGenerativeModel({model: aiConfig.modelName});
        this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // Wait for DatabaseLifecycleService to ensure ChromaDB is available
        await DatabaseLifecycleService.ready();

        // Use ChromaManager instead of direct client access
        this.memoryCollection   = await ChromaManager.getMemoryCollection();
        this.sessionsCollection = await ChromaManager.getSummaryCollection();

        // Do not proceed with summarization if the API key is missing.
        if (!this.model) {
            return;
        }

        logger.info('[Startup] Checking for unsummarized sessions...');

        try {
            const result = await this.summarizeSessions({});

            if (result.processed > 0) {
                logger.info(`✅ [Startup] Summarized ${result.processed} session(s):`);
                result.sessions.forEach(session => {
                    logger.info(`   - ${session.title} (${session.memoryCount} memories)`);
                });
                HealthService.recordStartupSummarization('completed', {
                    processed: result.processed,
                    sessions : result.sessions.map(s => ({ title: s.title, memoryCount: s.memoryCount }))
                });
            } else {
                logger.info('[Startup] No unsummarized sessions found');
                HealthService.recordStartupSummarization('completed', { processed: 0 });
            }
        } catch (error) {
            logger.warn('⚠️  [Startup] Session summarization failed:', error.message);
            logger.warn('    You can manually trigger summarization using the summarize_sessions tool');
            HealthService.recordStartupSummarization('failed', { error: error.message });
        }
    }

    /**
     * Finds sessions that have not yet been summarized.
     * @returns {Promise<String[]>}
     */
    async findUnsummarizedSessions() {
        const memories = await this.memoryCollection.get({ include: ['metadatas'] });
        if (memories.ids.length === 0) return [];

        const sessionIds           = [...new Set(memories.metadatas.map(m => m.sessionId).filter(Boolean))];
        const summaries            = await this.sessionsCollection.get({include: ['metadatas']});
        const summarizedSessionIds = new Set(summaries.metadatas.map(m => m.sessionId));

        return sessionIds.filter(id => !summarizedSessionIds.has(id));
    }

    /**
     * Summarizes a single session.
     * @param {String} sessionId
     * @returns {Promise<object|null>}
     */
    async summarizeSession(sessionId) {
        if (!sessionId) {
            logger.warn('summarizeSession called without a sessionId, opting out.');
            return null;
        }

        const memories = await this.memoryCollection.get({
            where  : {sessionId: sessionId},
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

Do not include any markdown formatting (e.g., \`json) in your response.

---

${aggregatedContent}
`;

        const result       = await this.model.generateContent(summaryPrompt);
        const responseText = result.response.text();
        const summaryData  = JSON.parse(responseText);

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

    /**
     * Summarizes sessions based on the provided sessionId or all unsummarized sessions.
     * @param {Object} options
     * @param {String} [options.sessionId]
     * @returns {Promise<{processed: number, sessions: object[]}>}
     */
    async summarizeSessions({ sessionId }) {
        let processed = [];

        if (sessionId) {
            const result = await this.summarizeSession(sessionId);
            if (result) processed.push(result);
        } else {
            const sessionsToSummarize = await this.findUnsummarizedSessions();
            for (const id of sessionsToSummarize) {
                const result = await this.summarizeSession(id);
                if (result) processed.push(result);
            }
        }
        return { processed: processed.length, sessions: processed };
    }
}

export default Neo.setupClass(SessionService);
