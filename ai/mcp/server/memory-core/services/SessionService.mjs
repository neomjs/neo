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
import http from 'http';
import https from 'https';
import RequestContextService from '../../shared/services/RequestContextService.mjs';

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
         * @member {String|null} _legacySessionId=crypto.randomUUID()
         * @protected
         */
        _legacySessionId: crypto.randomUUID(),
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

        logger.info(`[SessionService] Initialized new fallback session: ${this._legacySessionId}`);

        if (aiConfig.modelProvider === 'gemini') {
            const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
            if (!GEMINI_API_KEY) {
                logger.warn('⚠️  [Startup] GEMINI_API_KEY not set for generation model.');
                HealthService.recordStartupSummarization('skipped', { reason: 'GEMINI_API_KEY not set' });
                return;
            }
        }

        if (aiConfig.modelProvider === 'openAiCompatible') {
            logger.info(`[SessionService] Initializing generation model via OpenAI-Compatible API (${aiConfig.openAiCompatible.model})`);
            this.model = {
                generateContent: async (promptText) => {
                    logger.info(`[OpenAiCompatible] Sending summarization prompt (${promptText.length} chars)`);
                    return new Promise((resolve, reject) => {
                        const url = new URL(`${aiConfig.openAiCompatible.host}/v1/chat/completions`);
                        const client = url.protocol === 'https:' ? https : http;
                        const payload = {
                            model: aiConfig.openAiCompatible.model,
                            messages: [{ role: 'user', content: promptText }],
                            stream: false
                        };
                        const bodyData = Buffer.from(JSON.stringify(payload), 'utf8');

                        const headers = {
                            'Content-Type': 'application/json',
                            'Content-Length': bodyData.length
                        };

                        if (aiConfig.openAiCompatible.apiKey) {
                            headers['Authorization'] = `Bearer ${aiConfig.openAiCompatible.apiKey}`;
                        }

                        const req = client.request(url, {
                            method: 'POST',
                            headers,
                            timeout: 60 * 60 * 1000 // 1 hour timeout
                        }, (res) => {
                            let chunks = [];
                            res.on('data', c => chunks.push(c));
                            res.on('end', () => {
                                try {
                                    const rawStr = Buffer.concat(chunks).toString('utf8');
                                    if (res.statusCode < 200 || res.statusCode >= 300) {
                                        logger.error(`[OpenAiCompatible] Error ${res.statusCode}: ${rawStr}`);
                                        return reject(new Error(`OpenAiCompatible Status ${res.statusCode}: ${rawStr}`));
                                    }
                                    const data = JSON.parse(rawStr);
                                    const content = data.choices?.[0]?.message?.content || '';
                                    resolve({ response: { text: () => content } });
                                } catch (e) {
                                    reject(new Error(`OpenAiCompatible Parser Error: ${e.message}`));
                                }
                            });
                        });

                        req.on('error', e => reject(e));
                        req.on('timeout', () => { req.destroy(); reject(new Error('OpenAiCompatible Request Timeout')); });
                        req.write(bodyData);
                        req.end();
                    });
                }
            };
        } else {
            logger.info(`[SessionService] Initializing generation model via Gemini (${aiConfig.modelName})`);
            const geminiKey = process.env.GEMINI_API_KEY;
            const genAI = new GoogleGenerativeAI(geminiKey);
            this.model = genAI.getGenerativeModel({ model: aiConfig.modelName });
        }
    }

    /**
     * @returns {String|null}
     */
    get currentSessionId() {
        return RequestContextService.getSessionId() || this._legacySessionId;
    }

    /**
     * @param {String|null} value
     */
    set currentSessionId(value) {
        this._legacySessionId = value;
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

            this.summarizeSessions({}).then(result => {
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
            }).catch(error => {
                logger.warn('⚠️  [Startup] Session summarization failed:', error.message);
                logger.warn('    You can manually trigger summarization using the summarize_sessions tool');
                HealthService.recordStartupSummarization('failed', { error: error.message });
            });
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
        const sessions = {}; // {sessionId: {count: number, lastActivity: number}}

        allMetadatas.forEach(m => {
            if (!m.sessionId) return;

            if (!sessions[m.sessionId]) {
                sessions[m.sessionId] = { count: 0, lastActivity: 0 };
            }

            sessions[m.sessionId].count++;
            if (m.timestamp && m.timestamp > sessions[m.sessionId].lastActivity) {
                sessions[m.sessionId].lastActivity = m.timestamp;
            }
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

            // Explicitly exclude the current active session from both cases.
            // It is still accumulating memories, so summarizing it mid-flight is wasteful and
            // produces incomplete summaries. It will be correctly summarized on the next startup
            // when a new session takes over.
            if (sessionId === this.currentSessionId) {
                return;
            }

            // Case A: Completely Missing Summary (within the scoped window)
            if (summaryCount === undefined) {
                sessionsToUpdate.push({ sessionId, lastActivity: sessionData.lastActivity });
            }
            // Case B: Partial / Outdated Summary
            // If the memory count differs (new memories added OR deleted), we update.
            // This self-corrects: once updated, the counts match, and it won't run again.
            else if (sessionData.count !== summaryCount) {
                logger.info(`[SessionService] Updating active session ${sessionId} (DB: ${sessionData.count} !== Summary: ${summaryCount})`);
                sessionsToUpdate.push({ sessionId, lastActivity: sessionData.lastActivity });
            }
        });

        // 5. Sort candidates to prioritize the most recent sessions first
        sessionsToUpdate.sort((a, b) => b.lastActivity - a.lastActivity);

        return sessionsToUpdate.map(s => s.sessionId);
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

        // Natively bypass arbitrary Context Windows or chunking loops.
        // We enforce strict Lossless extraction for local performance consistency.
        // NOTE: Large sessions natively require the backing daemon (MLX/OpenAiCompatible) to have 
        // sufficient `n_ctx` capabilities (128k+).
        const aggregatedContent = memories.documents.join('\n\n---\n\n');

        let lastActivity = Date.now();
        let firstActivity = lastActivity;
        const extractedAgents = new Set();
        const extractedModels = new Set();
        let totalToolCalls = 0;
        const allToolsUsed = new Set();

        if (memories.metadatas && memories.metadatas.length > 0) {
            const timestamps = memories.metadatas.map(m => m.timestamp).filter(Boolean);
            if (timestamps.length > 0) {
                firstActivity = Math.min(...timestamps);
                lastActivity = Math.max(...timestamps);
            }
            memories.metadatas.forEach(m => {
                if (m.agent) extractedAgents.add(m.agent);
                if (m.model) extractedModels.add(m.model);
                if (m.amountToolCalls) {
                    const parsed = parseInt(m.amountToolCalls, 10);
                    if (!isNaN(parsed)) totalToolCalls += parsed;
                }
                if (m.toolsUsed) {
                    try {
                        const parsedTools = JSON.parse(m.toolsUsed);
                        if (Array.isArray(parsedTools)) {
                            parsedTools.forEach(t => {
                                if (t) {
                                    if (typeof t === 'string') {
                                        try {
                                            const inner = JSON.parse(t);
                                            const identifier = inner.name || inner.toolAction || inner.toolSummary || 'unknown_tool';
                                            allToolsUsed.add(String(identifier).substring(0, 50));
                                        } catch (e) {
                                            allToolsUsed.add(t.substring(0, 50));
                                        }
                                    } else {
                                        const identifier = t.name || t.toolAction || t.toolSummary || 'unknown_tool';
                                        allToolsUsed.add(String(identifier).substring(0, 50));
                                    }
                                }
                            });
                        } else {
                            allToolsUsed.add(String(parsedTools).substring(0, 50));
                        }
                    } catch (e) {
                        allToolsUsed.add(String(m.toolsUsed).substring(0, 50));
                    }
                }
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
Total Tool Calls Executed: ${totalToolCalls}
Unique Tools Utilized: ${Array.from(allToolsUsed).join(', ') || 'none recorded'}

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

        // Multi-tenant isolation tag (#10000): attach the active user's id when a request
        // context is present so `SummaryService.{listSummaries, querySummaries}` tenant-filters
        // can observe this summary. Undefined in stdio mode = legacy unfiltered single-tenant.
        const userId = RequestContextService.getUserId();

        const summaryMetadata = {
            sessionId, timestamp: lastActivity, memoryCount: memories.ids.length,
            title, category, quality, productivity, impact, complexity,
            technologies: (technologies || []).join(','),
            participatingAgents: participatingAgents.join(','),
            models: models.join(','),
            totalToolCalls,
            toolsUsed: Array.from(allToolsUsed).join(',')
        };
        if (userId) summaryMetadata.userId = userId;

        await this.sessionsCollection.upsert({
            ids: [summaryId],
            documents: [summary],
            metadatas: [summaryMetadata]
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
                            // Tenant tag (#10000): attribute the ingested artifact to the user
                            // who triggered the summarization cycle. In a multi-tenant cloud
                            // deploy, concurrent users summarizing overlapping time windows each
                            // produce their own tenant-tagged copy — cross-tenant isolation
                            // holds because the ChromaDB id is also conversation-scoped.
                            const planUserId = RequestContextService.getUserId();
                            const planMetadata = {
                                sessionId,
                                timestamp: stats.mtimeMs,
                                type: 'implementation_plan',
                                source: 'antigravity'
                            };
                            if (planUserId) planMetadata.userId = planUserId;

                            await this.memoryCollection.upsert({
                                ids: [artifactId],
                                metadatas: [planMetadata],
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
     * Overrides the current session ID manually.
     * Helpful for reconnecting a fragmented session after a server restart.
     *
     * @summary Manual session override (Legacy / Stdio fallback). When a request-scoped
     * session is active via `RequestContextService`, this method intentionally fails.
     * The `Mcp-Session-Id` header is the authoritative source for multi-tenant isolation,
     * and allowing manual overrides would break tenant boundaries.
     *
     * @protected Assumes the caller is authorized to claim the given sessionId in a single-tenant environment.
     * @param {Object} args
     * @param {String} args.sessionId
     * @returns {Promise<Object>}
     */
    async setSessionId({ sessionId }) {
        if (!sessionId || typeof sessionId !== 'string') {
            return { error: 'Invalid sessionId', code: 'INVALID_SESSION_ID' };
        }

        // Enforce request-scoped immutability
        if (RequestContextService.getSessionId()) {
            return {
                error: 'Cannot manually override request-scoped sessions. Manage session identity via Mcp-Session-Id header.',
                code: 'REQUEST_SCOPED_SESSION_ACTIVE'
            };
        }

        const oldSessionId = this.currentSessionId;
        if (oldSessionId === sessionId) {
            return { success: true, sessionId: this.currentSessionId, message: "Session ID unchanged." };
        }

        try {
            // Prune old session if 0 memories
            if (this.memoryCollection) {
                const memories = await this.memoryCollection.get({
                    where: { sessionId: oldSessionId },
                    limit: 1
                });
                if (!memories.ids || memories.ids.length === 0) {
                    logger.info(`[SessionService] Abandoning orphaned zero-memory session ID: ${oldSessionId}`);
                    // If no memories exist, we can just abandon the old ID.
                }
            }
        } catch (e) {
            logger.warn(`[SessionService] Error checking old session during override: ${e.message}`);
        }

        logger.info(`[SessionService] Overriding session ID: ${oldSessionId} -> ${sessionId}`);
        this.currentSessionId = sessionId;

        return { success: true, sessionId: this.currentSessionId, replacedSessionId: oldSessionId };
    }

    /**
     * Queues a session for summarization by writing a 'pending' marker
     * to the SummarizationJobs table and triggering the asynchronous detector.
     * @param {String} sessionId 
     */
    queueSummarizationJob(sessionId) {
        if (!aiConfig.autoSummarize) return;

        const db = GraphService.db?.storage?.db;
        if (!db) return;
        try {
            db.prepare(`
                INSERT INTO SummarizationJobs (session_id, status)
                VALUES (?, 'pending')
                ON CONFLICT(session_id) DO UPDATE SET 
                    status = 'pending',
                    lease_token = NULL,
                    expires_at = NULL
                WHERE status != 'completed' AND status != 'in_progress'
            `).run(sessionId);
            
            // Asynchronously trigger processing so we don't block the caller (e.g. disconnect lifecycle)
            setTimeout(() => this.processPendingSummarizations(), 100);
        } catch (e) {
            logger.warn(`[SessionService] Error queuing summarization for ${sessionId}: ${e.message}`);
        }
    }

    /**
     * Finds pending summarization jobs and attempts to process them.
     */
    async processPendingSummarizations() {
        const db = GraphService.db?.storage?.db;
        if (!db) return;
        
        try {
            const pendingJobs = db.prepare(`
                SELECT session_id FROM SummarizationJobs WHERE status = 'pending'
            `).all();
            
            for (const job of pendingJobs) {
                // Background execution. The inner call uses claimSummarizationJob to get a lease.
                this.summarizeSessions({ sessionId: job.session_id }).catch(e => {
                    logger.error(`[SessionService] Background summarization failed for ${job.session_id}:`, e);
                });
            }
        } catch (e) {
            logger.warn(`[SessionService] Error processing pending summarizations: ${e.message}`);
        }
    }

    /**
     * Claims an exclusive lease on a summarization job using the SummarizationJobs table.
     * Prevents race conditions across concurrent MCP instances.
     * @param {String} sessionId 
     * @param {String} leaseToken 
     * @param {Number} [ttlMs=300000] Default 5-minute lease
     * @returns {Boolean} true if the lease was claimed successfully, false otherwise.
     */
    claimSummarizationJob(sessionId, leaseToken, ttlMs = 300000) {
        const db = GraphService.db?.storage?.db;
        if (!db) return true; // Fallback: allow execution if DB is somehow missing
        
        const now = Date.now();
        const expiresAt = now + ttlMs;
        
        try {
            const claimTx = db.transaction(() => {
                const existing = db.prepare('SELECT status, expires_at FROM SummarizationJobs WHERE session_id = ?').get(sessionId);
                
                if (!existing) {
                    db.prepare(`
                        INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
                        VALUES (?, 'in_progress', ?, ?, 0)
                    `).run(sessionId, leaseToken, expiresAt);
                    return true;
                }
                
                if (existing.status === 'completed') {
                    return false;
                }
                
                if (existing.status === 'in_progress' && existing.expires_at < now) {
                    db.prepare(`
                        UPDATE SummarizationJobs 
                        SET lease_token = ?, expires_at = ?, retry_count = retry_count + 1
                        WHERE session_id = ?
                    `).run(leaseToken, expiresAt, sessionId);
                    return true;
                }
                
                if (existing.status === 'pending' || existing.status === 'failed') {
                     db.prepare(`
                        UPDATE SummarizationJobs 
                        SET status = 'in_progress', lease_token = ?, expires_at = ?, retry_count = retry_count + 1
                        WHERE session_id = ?
                    `).run(leaseToken, expiresAt, sessionId);
                    return true;
                }
                
                return false;
            });
            
            return claimTx();
        } catch (e) {
            logger.warn(`[SessionService] Error claiming job for ${sessionId}: ${e.message}`);
            return false;
        }
    }

    /**
     * Marks a summarization job as completed in the coordinator table.
     * @param {String} sessionId 
     */
    completeSummarizationJob(sessionId) {
        const db = GraphService.db?.storage?.db;
        if (!db) return;
        try {
            db.prepare(`
                UPDATE SummarizationJobs 
                SET status = 'completed', lease_token = NULL 
                WHERE session_id = ?
            `).run(sessionId);
        } catch (e) {
            logger.warn(`[SessionService] Error completing job for ${sessionId}: ${e.message}`);
        }
    }

    /**
     * Marks a summarization job as failed in the coordinator table.
     * @param {String} sessionId 
     */
    failSummarizationJob(sessionId) {
        const db = GraphService.db?.storage?.db;
        if (!db) return;
        try {
            db.prepare(`
                UPDATE SummarizationJobs 
                SET status = 'failed', lease_token = NULL 
                WHERE session_id = ?
            `).run(sessionId);
        } catch (e) {
            logger.warn(`[SessionService] Error failing job for ${sessionId}: ${e.message}`);
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
            const leaseToken = crypto.randomUUID();

            if (sessionId) {
                if (this.claimSummarizationJob(sessionId, leaseToken)) {
                    try {
                        const result = await this.summarizeSession(sessionId);
                        if (result) {
                            this.completeSummarizationJob(sessionId);
                            processed.push(result);
                        } else {
                            this.failSummarizationJob(sessionId);
                        }
                    } catch (err) {
                        this.failSummarizationJob(sessionId);
                        logger.error(`[SessionService] Summarization failed for ${sessionId}:`, err);
                    }
                } else {
                    logger.info(`[SessionService] Skipping session ${sessionId} - active lease held by another instance or already completed.`);
                }
            } else {
                const sessionsToSummarize = await this.findSessionsToSummarize(includeAll);

                // Hardware concurrency scaling
                let batchSize;
                if (aiConfig.modelProvider === 'gemini') {
                    // Gemini (Cloud) scales over parallel network connections based on host CPU
                    batchSize = Math.max(1, Math.floor(os.cpus().length * 0.75));
                } else {
                    // Local LLMs with massive-context bounds MUST strictly track serial execution to prevent VRAM OOM
                    batchSize = 1;
                }

                const total = sessionsToSummarize.length;

                logger.info(`[SessionService] Found ${total} sessions to summarize. Processing in batches of ${batchSize}...`);

                for (let i = 0; i < total; i += batchSize) {
                    const chunk = sessionsToSummarize.slice(i, i + batchSize);
                    logger.info(`[SessionService] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(total / batchSize)} (${chunk.length} sessions)...`);

                    const promises = chunk.map(async (id) => {
                        if (!this.claimSummarizationJob(id, leaseToken)) {
                            logger.info(`[SessionService] Skipping session ${id} - active lease held by another instance or already completed.`);
                            return null;
                        }

                        try {
                            const result = await this.summarizeSession(id);
                            if (result) {
                                this.completeSummarizationJob(id);
                                return result;
                            } else {
                                this.failSummarizationJob(id);
                                return null;
                            }
                        } catch (err) {
                            this.failSummarizationJob(id);
                            logger.error(`[SessionService] Summarization failed for ${id}:`, err);
                            return null;
                        }
                    });

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
