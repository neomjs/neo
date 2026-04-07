import { GoogleGenerativeAI } from '@google/generative-ai';
import aiConfig from '../config.mjs';
import Base from '../../../../../src/core/Base.mjs';
import crypto from 'crypto';
import GraphService from './GraphService.mjs';
import StorageRouter from '../managers/StorageRouter.mjs';
import HealthService from './HealthService.mjs';
import Json from '../../../../../src/util/Json.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../logger.mjs';

/**
 * @summary Service for handling session summarization and drift detection.
 *
 * **Architecture & Strategy:**
 * The primary challenge in managing session summaries is that agents are stateless and sessions
 * rarely have a clean, explicit "end" event (e.g., crashes, network disconnects, or simply stopping work).
 *
 * To address this, this service employs an **"Eventual Consistency"** strategy for summarization:
 * 1.  **Startup Scan:** On initialization, we scan for sessions that have been active recently (last 30 days).
 * 2.  **Drift Detection:** We compare the actual number of memories in the database against the `memoryCount`
 *     recorded in the existing summary.
 * 3.  **Self-Healing:** If the counts differ (indicating new memories added or old ones deleted), we
 *     trigger a re-summarization.
 *
 * **Parallel Sessions Trade-off:**
 * In a scenario where multiple sessions are running in parallel (e.g., Session A and Session B),
 * they may continuously update the memory count. This strategy accepts the overhead of
 * potentially re-summarizing an active session multiple times to ensure that if any session
 * crashes or ends abruptly, its context is preserved and up-to-date for the next agent.
 * Data integrity and context availability are prioritized over minimizing LLM token usage.
 *
 * @class Neo.ai.mcp.server.memory-core.services.SessionService
 * @extends Neo.core.Base
 * @singleton
 */
class SessionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.SessionService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.SessionService',
        /**
         * @member {String|null} currentSessionId=crypto.randomUUID()
         * @protected
         */
        currentSessionId: crypto.randomUUID(),
        /**
         * @member {Object|null} memoryCollection_=null
         * @protected
         * @reactive
         */
        memoryCollection_: null,
        /**
         * @member {GoogleGenerativeAI|null} model_=null
         * @protected
         * @reactive
         */
        model_: null,
        /**
         * @member {Object|null} sessionsCollection_=null
         * @protected
         * @reactive
         */
        sessionsCollection_: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        logger.info(`[SessionService] Initialized new session: ${this.currentSessionId}`);

        if (aiConfig.modelProvider === 'gemini') {
            const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
            if (!GEMINI_API_KEY) {
                logger.warn('⚠️  [Startup] GEMINI_API_KEY not set for generation model.');
                HealthService.recordStartupSummarization('skipped', { reason: 'GEMINI_API_KEY not set' });
                return;
            }
        }

        if (aiConfig.modelProvider === 'ollama') {
            logger.info(`[SessionService] Initializing generation model via Ollama (${aiConfig.ollama.model})`);
            this.model = {
                generateContent: async (promptText) => {
                    logger.info(`[Ollama] Sending summarization prompt (${promptText.length} chars)`);
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 60 * 60 * 1000); // 1 hour timeout

                    let response;
                    try {
                        response = await fetch(`${aiConfig.ollama.host}/api/generate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: aiConfig.ollama.model,
                                prompt: promptText,
                                stream: false,
                                keep_alive: "1h",
                                options: {
                                    num_ctx: 200000 // Force massive context window
                                }
                            }),
                            signal: controller.signal
                        });
                    } finally {
                        clearTimeout(timeoutId);
                    }
                    const data = await response.json();

                    if (data.error) {
                        logger.error(`[Ollama] Error: ${data.error}`);
                        throw new Error(`Ollama Generation Error: ${data.error}`);
                    }
                    return {
                        response: {
                            text: () => data.response
                        }
                    };
                }
            };
        } else {
            logger.info(`[SessionService] Initializing generation model via Gemini (${aiConfig.modelName})`);
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = genAI.getGenerativeModel({ model: aiConfig.modelName });
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // Wait for StorageRouter to be ready (connected)
        await StorageRouter.ready();

        // Use StorageRouter
        this.memoryCollection = await StorageRouter.getMemoryCollection();
        this.sessionsCollection = await StorageRouter.getSummaryCollection();

        // Do not proceed with summarization if the API key is missing.
        if (!this.model) {
            return;
        }

        if (aiConfig.data.autoSummarize) {
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
                        sessions: result.sessions.map(s => ({ title: s.title, memoryCount: s.memoryCount }))
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
    }

    /**
     * Finds sessions that need summarization by detecting "Drift" between the database state
     * and the summary metadata.
     *
     * **Logic:**
     * 1.  **Scope:** Fetches memory and summary metadata for the last 30 days. This optimization
     *     prevents full-table scans on large databases while covering the vast majority of active work.
     * 2.  **Grouping:** Aggregates actual memory counts per session from the raw memory data.
     * 3.  **Comparison:**
     *     -   **Missing Summary:** If a session has memories but no summary, it is flagged.
     *     -   **Count Mismatch:** If `DB_Count !== Summary_Count`, it implies the session has changed
     *         (new memories added or removed) since the last summary. It is flagged for update.
     *
     * **Scenarios:**
     * -   **Happy Path (Sequential):** Session A ends. Summary is created (Count: 10). Next startup sees
     *     DB: 10, Summary: 10. Match. No action. Zero overhead.
     * -   **Parallel / Crash Path:** Session A crashes after adding 5 memories. Summary has 10, DB has 15.
     *     Next startup sees Mismatch. Re-summarizes to capture the lost 5 memories.
     *
     * @param {Boolean} [includeAll=false] If true, ignores the 30-day limit and scans all sessions.
     * @returns {Promise<String[]>} List of Session IDs requiring summarization.
     */
    async findSessionsToSummarize(includeAll = false) {
        // 1. Get metadata for memories
        // Default: Last 30 Days only (limits scope to recent active work).
        // Override: All time (if includeAll is true).
        const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
        const minTimestamp = Date.now() - ONE_MONTH_MS;
        const limit = aiConfig.summarizationBatchLimit || 2000;
        const maxIterations = 1000; // Safety break: max 2M records (2000 * 1000)

        let allMetadatas = [];
        let offset = 0;
        let hasMore = true;
        let iterations = 0;

        // Build query options dynamically to avoid passing `where: undefined`
        const baseQueryOptions = {
            include: ['metadatas'],
            limit
        };

        const memoryQueryOptions = { ...baseQueryOptions };

        if (!includeAll) {
            memoryQueryOptions.where = {
                timestamp: {
                    '$gt': minTimestamp
                }
            };
        }

        while (hasMore) {
            if (iterations++ > maxIterations) {
                logger.warn(`[SessionService] Scanned ${iterations * limit} memory records. Stopping safety break.`);
                break;
            }

            memoryQueryOptions.offset = offset;
            const batch = await this.memoryCollection.get(memoryQueryOptions);

            if (batch.ids.length === 0) {
                hasMore = false;
            } else {
                allMetadatas = allMetadatas.concat(batch.metadatas);
                offset += limit;

                if (batch.ids.length < limit) {
                    hasMore = false;
                }
            }
        }

        if (allMetadatas.length === 0) return [];

        // 2. Group memories by session
        const sessions = {}; // {sessionId: {count: number}}

        allMetadatas.forEach(m => {
            if (!m.sessionId) return;

            if (!sessions[m.sessionId]) {
                sessions[m.sessionId] = { count: 0 };
            }

            sessions[m.sessionId].count++;
        });

        // 3. Fetch existing summaries
        // Matches the scope of the memory fetch (30 days or all).
        let allSummaryMetadatas = [];
        offset = 0;
        hasMore = true;
        iterations = 0;

        const summaryQueryOptions = { ...baseQueryOptions };

        if (!includeAll) {
            summaryQueryOptions.where = {
                timestamp: {
                    '$gt': minTimestamp
                }
            };
        }

        while (hasMore) {
            if (iterations++ > maxIterations) {
                logger.warn(`[SessionService] Scanned ${iterations * limit} summary records. Stopping safety break.`);
                break;
            }

            summaryQueryOptions.offset = offset;
            const batch = await this.sessionsCollection.get(summaryQueryOptions);

            if (batch.ids.length === 0) {
                hasMore = false;
            } else {
                allSummaryMetadatas = allSummaryMetadatas.concat(batch.metadatas);
                offset += limit;

                if (batch.ids.length < limit) {
                    hasMore = false;
                }
            }
        }

        const summaryMap = {}; // {sessionId: memoryCount}

        allSummaryMetadatas.forEach(m => {
            if (m.sessionId) {
                summaryMap[m.sessionId] = m.memoryCount || 0;
            }
        });

        // 4. Determine candidates
        const sessionsToUpdate = [];

        Object.keys(sessions).forEach(sessionId => {
            const sessionData = sessions[sessionId];
            const summaryCount = summaryMap[sessionId];

            // Case A: Completely Missing Summary (within the scoped window)
            if (summaryCount === undefined) {
                sessionsToUpdate.push(sessionId);
            }
            // Case B: Partial / Outdated Summary
            // If the memory count differs (new memories added OR deleted), we update.
            // This self-corrects: once updated, the counts match, and it won't run again.
            //
            // We explicitly exclude the current session. Since it is active, its memory count
            // is constantly changing (drift is expected). We only want to summarize it once it ends.
            // Note: This check is irrelevant for startup (since no memories exist yet for the new session),
            // but crucial when an agent manually triggers the summarization tool during an active session.
            else if (sessionData.count !== summaryCount && sessionId !== this.currentSessionId) {
                logger.info(`[SessionService] Updating active session ${sessionId} (DB: ${sessionData.count} !== Summary: ${summaryCount})`);
                sessionsToUpdate.push(sessionId);
            }
        });

        return sessionsToUpdate;
    }

    /**
     * Summarizes a single session.
     * @param {String} sessionId The ID of the session to summarize.
     * @returns {Promise<object|null>}
     */
    async summarizeSession(sessionId) {
        if (!sessionId) {
            logger.warn('summarizeSession called without a sessionId, opting out.');
            return null;
        }

        const memories = await this.memoryCollection.get({
            where: { sessionId },
            include: ['documents', 'metadatas']
        });

        if (memories.ids.length === 0) return null;

        const aggregatedContent = memories.documents.join('\n\n---\n\n');

        let lastActivity = Date.now();
        let firstActivity = lastActivity;
        const extractedAgents = new Set();
        const extractedModels = new Set();

        if (memories.metadatas && memories.metadatas.length > 0) {
            const timestamps = memories.metadatas.map(m => m.timestamp).filter(Boolean);
            if (timestamps.length > 0) {
                firstActivity = Math.min(...timestamps);
                lastActivity = Math.max(...timestamps);
            }
            memories.metadatas.forEach(m => {
                if (m.agent) extractedAgents.add(m.agent);
                if (m.model) extractedModels.add(m.model);
            });
        }

        const participatingAgents = Array.from(extractedAgents);
        const models = Array.from(extractedModels);

        const summaryPrompt = `
Analyze the following development session and provide a structured summary in JSON format. The JSON object should have the following properties:

- "summary": (String) A detailed summary of the session. Identify the main goal, key decisions, modified code, and the final outcome. Mention the involvement of specific agents if obvious.
- "title": (String) A concise, descriptive title for the session (max 10 words).
- "category": (String) Classify the task into one of the following: 'bugfix', 'feature', 'refactoring', 'documentation', 'new-app', 'analysis', 'other'.
- "quality": (Number) A score from 0-100 rating the session's flow and focus. 100 is a perfect, focused session. 0 is a completely derailed or useless session.
- "productivity": (Number) A score from 0-100 indicating if the session's primary goals were achieved. 100 means all goals were met. 0 means no goals were met.
- "impact": (Number) A score from 0-100 estimating the significance of the changes made. 100 is a critical, high-impact change. 0 is a trivial or no-impact change.
- "complexity": (Number) A score from 0-100 rating the task's complexity based on factors like file touchpoints, depth of changes (core vs. app-level), and cognitive load. A simple typo fix is < 10. A deep refactoring of a core module is > 90.
- "technologies": (String[]) An array of key technologies, frameworks, or libraries involved (e.g., "neo.mjs", "chromadb", "nodejs").

Critical: Do not include any markdown formatting (e.g., \`json) in your response.

Context: This session involved the following agents: ${participatingAgents.join(', ') || 'unknown'} running on models: ${models.join(', ') || 'unknown'}.

---

${aggregatedContent}
`;

        const result = await this.model.generateContent(summaryPrompt);
        const responseText = result.response.text();
        const summaryData = Json.extract(responseText);

        if (!summaryData) {
            logger.warn(`Failed to parse summary for session ${sessionId}`);
            return null;
        }

        const { summary, title, category, quality, productivity, impact, complexity, technologies } = summaryData;

        const summaryId = `summary_${sessionId}`;

        await this.sessionsCollection.upsert({
            ids: [summaryId],
            documents: [summary],
            metadatas: [{
                sessionId, timestamp: lastActivity, memoryCount: memories.ids.length,
                title, category, quality, productivity, impact, complexity,
                technologies: (technologies || []).join(','),
                participatingAgents: participatingAgents.join(','),
                models: models.join(',')
            }]
        });

        // --- 1. Topological Ingestion (Graph Mapping) ---
        GraphService.upsertNode({
            id: summaryId,
            type: 'SESSION_SUMMARY',
            name: title,
            description: `${category} session by ${participatingAgents.join(', ')}`,
            semanticVectorId: summaryId
        });

        // Tie the summary strategically to the current focal point
        GraphService.linkNodes('frontier', summaryId, 'SESSION_COMPLETED', 1.0);

        // --- 2. Semantic Extraction (Regex Linkage) ---
        const issueRegex = /(?:#|issue-)(\d+)/gi;
        const linkedIssues = new Set();
        let match;

        while ((match = issueRegex.exec(summary)) !== null) {
            linkedIssues.add(`issue-${match[1]}`);
        }

        while ((match = issueRegex.exec(aggregatedContent)) !== null) {
            linkedIssues.add(`issue-${match[1]}`);
        }

        linkedIssues.forEach(issueId => {
            // Tie the summary session logically to the issues being discussed
            GraphService.linkNodes(summaryId, issueId, 'DISCUSSED_IN', 0.8);
        });

        // 3. Antigravity Artifact Ingestion (Passive Scan)
        // Add a 12-hour buffer window for offline drafting match
        await this.ingestAntigravityArtifacts(sessionId, summaryId, firstActivity - (12 * 3600000), lastActivity + (12 * 3600000));

        return { sessionId, summaryId, title, memoryCount: memories.ids.length };
    }

    /**
     * Passively scans the local Antigravity brain directory for implementation plans
     * and structurally ingests them into the vector DB and edge graph if their timestamps
     * match the active session.
     * @param {String} sessionId 
     * @param {String} summaryId
     * @param {Number} minTimeMs
     * @param {Number} maxTimeMs
     */
    async ingestAntigravityArtifacts(sessionId, summaryId, minTimeMs, maxTimeMs) {
        try {
            const homeDir = os.homedir();
            const brainDir = path.join(homeDir, '.gemini', 'antigravity', 'brain');

            if (!fs.existsSync(brainDir)) return;

            const conversations = fs.readdirSync(brainDir);
            for (const convId of conversations) {
                const planPath = path.join(brainDir, convId, 'implementation_plan.md');
                if (fs.existsSync(planPath)) {
                    const stats = fs.statSync(planPath);
                    // Match artifact to session timeframe
                    if (stats.mtimeMs >= minTimeMs && stats.mtimeMs <= maxTimeMs) {
                        const content = fs.readFileSync(planPath, 'utf8');
                        const artifactId = `plan_${convId}`;

                        logger.info(`[SessionService] Ingesting Antigravity artifact: ${planPath}`);

                        // Push into ChromaDB
                        try {
                            await this.memoryCollection.upsert({
                                ids: [artifactId],
                                metadatas: [{
                                    sessionId,
                                    timestamp: stats.mtimeMs,
                                    type: 'implementation_plan',
                                    source: 'antigravity'
                                }],
                                documents: [content]
                            });
                        } catch (e) {
                            logger.warn(`[SessionService] Failed to vector-upsert plan: ${e.message}`);
                        }

                        // Tie it structurally into Graph
                        GraphService.upsertNode({
                            id: artifactId,
                            type: 'IMPLEMENTATION_PLAN',
                            name: `Antigravity Plan (${convId})`,
                            description: `Strategically generated implementation plan via Antigravity Brain for session ${sessionId}.`,
                            semanticVectorId: artifactId
                        });

                        // Link it to the current Session summary node
                        GraphService.linkNodes(summaryId, artifactId, 'CONTAINED_PLAN', 1.0);
                    }
                }
            }
        } catch (e) {
            logger.warn(`[SessionService] Antigravity artifacts ingestion failed: ${e.message}`);
        }
    }

    /**
     * Summarizes sessions based on the provided sessionId or all unsummarized sessions.
     * Note: If the current active sessionId is explicitly passed, it WILL be summarized.
     * @param {Object}  options
     * @param {Boolean} [options.includeAll] If true, scans all sessions regardless of time window.
     * @param {String}  [options.sessionId]  A specific session ID to summarize.
     * @returns {Promise<{processed: number, sessions: object[]}|{error: string, message: string, code: string}>}
     */
    async summarizeSessions({ includeAll, sessionId } = {}) {
        try {
            let processed = [];

            if (sessionId) {
                const result = await this.summarizeSession(sessionId);
                if (result) processed.push(result);
            } else {
                const sessionsToSummarize = await this.findSessionsToSummarize(includeAll);

                // Hardware concurrency scaling
                let batchSize;
                if (aiConfig.modelProvider === 'gemini') {
                    // Gemini (Cloud) scales over parallel network connections based on host CPU
                    batchSize = Math.max(1, Math.floor(os.cpus().length * 0.75));
                } else {
                    // Ollama (Local) with massive-context bounds MUST strictly track serial execution to prevent VRAM OOM
                    batchSize = 1; 
                }

                const total = sessionsToSummarize.length;

                logger.info(`[SessionService] Found ${total} sessions to summarize. Processing in batches of ${batchSize}...`);

                for (let i = 0; i < total; i += batchSize) {
                    const chunk = sessionsToSummarize.slice(i, i + batchSize);
                    logger.info(`[SessionService] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(total / batchSize)} (${chunk.length} sessions)...`);

                    const promises = chunk.map(id => this.summarizeSession(id));
                    const results = await Promise.all(promises);
                    const batchResult = results.filter(Boolean);

                    processed.push(...batchResult);
                }
            }

            return { processed: processed.length, sessions: processed };

        } catch (error) {
            logger.error('[SessionService] Error during session summarization:', error);
            return {
                error: 'Session summarization failed',
                message: error.message,
                code: 'SUMMARIZATION_ERROR'
            };
        }
    }
}

export default Neo.setupClass(SessionService);
