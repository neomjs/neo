import aiConfig             from '../../mcp/server/knowledge-base/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
import {buildChatModel}     from '../../provider/buildChatModel.mjs';
import ChromaManager        from './ChromaManager.mjs';
import fs                   from 'fs-extra';
import logger               from '../../mcp/server/knowledge-base/logger.mjs';
import path                 from 'path';
import QueryService         from './QueryService.mjs';

/**
 * @summary Orchestrates Retrieval-Augmented Generation (RAG) by combining semantic search with LLM synthesis.
 *
 * This service acts as the bridge between the user's natural language question and the project's knowledge base.
 * Instead of simply returning a list of files, it:
 * 1.  **Retrieves**: Uses `QueryService` to find the most relevant files based on semantic similarity and intelligent scoring (boosting guides, architectural docs).
 * 2.  **Reads**: Fetches the full content of these files from the local filesystem to ensure the LLM has complete context (avoiding truncated metadata).
 * 3.  **Synthesizes**: Sends the query and the file contents to the configured synthesis model (Gemini / OpenAI-compatible / Ollama) to generate a precise, grounded answer.
 *
 * This "Read-Eval-Generate" loop allows agents to ask complex questions like "How do I implement a Store?" and get a
 * code-complete answer without manually searching and reading multiple files.
 *
 * @class Neo.ai.services.knowledge-base.SearchService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.knowledge-base.QueryService
 */
class SearchService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.SearchService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.SearchService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object|null} model=null
     * @protected
     */
    model = null

    /**
     * Builds the synthesis model via the configured provider (`gemini` / `openAiCompatible` / `ollama`)
     * through the shared `buildChatModel` selector, so local deployments synthesize without a remote
     * Gemini key. `this.model` stays `null` only for `gemini` with no API key; `ask()` then returns the
     * degraded-reference response rather than attempting a remote call.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.model = buildChatModel({
            modelProvider          : aiConfig.modelProvider,
            openAiCompatibleConfig : aiConfig.openAiCompatible,
            ollamaConfig           : aiConfig.ollama,
            geminiApiKey           : process.env.GEMINI_API_KEY,
            geminiModelName        : aiConfig.modelName
        });
    }

    /**
     * Ensures the service dependencies are ready.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }

    /**
     * Returns embedded chunk content when a ranked result carries full source metadata.
     * @param {Object} [metadata] Result metadata from QueryService.
     * @returns {String} The embedded content or an empty string.
     */
    getEmbeddedReferenceContent(metadata = {}) {
        return typeof metadata.content === 'string' && metadata.content.trim()
            ? metadata.content
            : '';
    }

    /**
     * Determines whether a ranked result belongs to a tenant/repo that must not be hydrated
     * from the local neoRootDir filesystem.
     * @param {Object} [metadata] Result metadata from QueryService.
     * @returns {Boolean} True when local filesystem hydration is unsafe for this reference.
     */
    isNonLocalTenantReference(metadata = {}) {
        const defaultTenantId = aiConfig.defaultTenantId;
        const defaultRepoSlug = aiConfig.defaultRepoSlug;

        if (metadata.repoSlug && metadata.repoSlug !== defaultRepoSlug) {
            return true;
        }

        if (!metadata.tenantId) {
            return false;
        }

        return metadata.tenantId !== defaultTenantId;
    }

    /**
     * Resolves the best available source content for RAG synthesis.
     *
     * Local Neo references keep using neoRootDir filesystem hydration so agents see the
     * current checkout. Tenant-ingested references use Chroma metadata content instead,
     * preventing same-relative-path collisions from reading files out of the host repo.
     *
     * @param {Object} ref Query reference.
     * @returns {Promise<String>} Hydrated content or the standard placeholder.
     */
    async hydrateReferenceContent(ref) {
        const metadata        = ref.metadata || {};
        const embeddedContent = this.getEmbeddedReferenceContent(metadata);
        let   content         = '';
        let   absoluteSource  = '';

        if (this.isNonLocalTenantReference(metadata)) {
            if (embeddedContent) {
                return embeddedContent;
            }

            logger.warn(`[SearchService] Missing metadata.content for non-local tenant ref.source="${ref.source}" (tenantId="${metadata.tenantId}", repoSlug="${metadata.repoSlug || ''}") — refusing neoRootDir fallback.`);

            return 'No Content (File missing or empty)';
        }

        absoluteSource = ref.source && path.isAbsolute(ref.source)
            ? ref.source
            : path.resolve(aiConfig.neoRootDir, ref.source || '');

        if (absoluteSource && await fs.pathExists(absoluteSource)) {
            try {
                content = await fs.readFile(absoluteSource, 'utf8');
            } catch (err) {
                logger.warn(`[SearchService] Failed to read file ${absoluteSource}:`, err.message);
            }
        }

        if (!content && embeddedContent) {
            return embeddedContent;
        }

        if (!content) {
            content = 'No Content (File missing or empty)';
            logger.warn(`[SearchService] Empty context for ref.source="${ref.source}" (resolved to "${absoluteSource}") — chunk content will not reach the synthesis LLM.`);
        }

        return content;
    }

    /**
     * @summary Creates the degraded response used when retrieval succeeds but synthesis is unavailable.
     *
     * Returned as a SUCCESS content payload (NO top-level `error` key) so the MCP boundary delivers
     * the references + reason to the caller. `BaseServer.formatToolResult` routes any `'error' in result`
     * object to an error envelope (`Tool Error: … Message: …`) that discards `answer`/`references`/`reason`
     * — so an `error` key here would defeat the whole point of degrading gracefully. Callers detect
     * degradation via `degraded: true`; `degradedCode` disambiguates the cause for diagnostics.
     * @param {Object} params
     * @param {Object[]} params.references Ranked references returned by QueryService.
     * @param {Error|String} params.error The synthesis failure to expose in bounded form.
     * @param {String} [params.code] Explicit degraded cause code; when omitted, derived from the reason
     *     (`synthesis_timeout` when it reports a timeout, else `synthesis_failed`).
     * @returns {{answer: String, references: Object[], degraded: Boolean, degradedCode: String, reason: String}}
     * @private
     */
    #createDegradedSynthesisResponse({references, error, code}) {
        const reason       = this.#sanitizeSynthesisError(error);
        const degradedCode = code || (/timed out/i.test(reason) ? 'synthesis_timeout' : 'synthesis_failed');

        return {
            answer: `Knowledge-base retrieval succeeded, but answer synthesis is currently unavailable (${reason}). Use the references directly while the synthesis provider recovers.`,
            references,
            degraded: true,
            degradedCode,
            reason
        };
    }

    /**
     * @summary Bounds synthesis-provider errors before returning them through MCP callers.
     * @param {Error|String} error The raw provider error.
     * @returns {String} A credential-safe, bounded reason string.
     * @private
     */
    #sanitizeSynthesisError(error) {
        const raw = typeof error === 'string'
            ? error
            : (error?.message || 'Synthesis provider unavailable');

        return raw
            .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
            .slice(0, 500);
    }

    /**
     * Performs a semantic search via QueryService and synthesizes an answer using the LLM.
     *
     * @param {Object} params
     * @param {String} params.query The natural language query.
     * @param {String} [params.type='all'] Optional content type filter (e.g., 'guide', 'src').
     * @param {Number} [params.limit=5] Number of source files to include in the context.
     * @returns {Promise<Object>} The synthesized answer and references.
     */
    async ask({query, type = 'all', limit = 5}) {
        logger.info(`[SearchService] Processing RAG query: "${query}" (Type: ${type})`);

        // 1. Retrieve most relevant files using QueryService's scoring logic
        const queryResult = await QueryService.queryDocuments({query, type, limit, includeMetadata: true});

        if (queryResult.message || !queryResult.results || queryResult.results.length === 0) {
            return {
                answer    : "No relevant documents found in the knowledge base.",
                references: []
            };
        }

        const references = queryResult.results.map(r => ({
            name  : r.source.split('/').pop(),
            source: r.source,
            score : Number(r.score)
        }));

        if (!this.model) {
            return this.#createDegradedSynthesisResponse({
                references,
                error: 'GEMINI_API_KEY is required for RAG features.',
                code : 'no_provider'
            });
        }

        const contextReferences = queryResult.results.map((r, index) => ({
            ...references[index],
            metadata: r.metadata || {}
        }));

        // 2. Read source contents for context.
        //
        // All source loaders store `metadata.source` as a path relative to `neoRootDir`
        // so the Chroma collection shipped with each neo release remains portable across
        // recipients' filesystems. We resolve against the consumer's own `neoRootDir`
        // at read time. Before the relative-source fix, this branch did a bare `fs.pathExists(ref.source)`
        // which silently succeeded for legacy absolute-path chunks but failed for the
        // relative-path chunks emitted by ApiSource / TestSource — producing phantom
        // `No Content (File missing or empty)` context. The synthesis LLM then saw
        // empty documents and returned placeholder "I don't have enough information"
        // answers for every `type='src'` / `type='ai-infrastructure'` query. The
        // `path.isAbsolute` short-circuit keeps legacy absolute-path chunks working
        // during the grace period when a consumer has not yet re-synced.
        //
        // Tenant content uses metadata-embedded hydration. The measured chunk distribution
        // keeps the V1 storage cost acceptable, while
        // avoiding server-mirror infrastructure. Non-local tenants may use the same
        // relative `source` strings as Neo itself, so those references hydrate from
        // metadata.content and never fall through to the host checkout.
        const contextPromises = contextReferences.map(async (ref, index) => {
            const content = await this.hydrateReferenceContent(ref);

            return `--- DOCUMENT ${index + 1} (${ref.name} from ${ref.source}) ---\n${content}`;
        });

        const contextDocs = (await Promise.all(contextPromises)).join('\n\n');

        const prompt = `
You are an expert Neo.mjs architect.
**CRITICAL INSTRUCTION:** The framework is named "Neo.mjs". Never refer to it as "Neo.js".

Answer the following question using **ONLY** the provided context documents.
If the answer cannot be found in the documents, state that you don't have enough information.

Question: ${query}

Context:
${contextDocs}

Instructions:
1. Synthesize a clear, concise answer.
2. Cite specific classes or files from the context where appropriate.
3. Do not make up code or facts not present in the text.
4. Adhere to the terminology: "Neo.mjs", "App Worker", "VDom Worker", "config system".
`;

        // 3. Generate Answer
        let result, answer;

        try {
            result = await this.model.generateContent(prompt, {
                timeoutMs     : aiConfig.askSynthesisTimeoutMs,
                operationLabel: 'ask_knowledge_base synthesis'
            });
            answer = result.response.text();
        } catch (error) {
            const degraded = this.#createDegradedSynthesisResponse({references, error});

            logger.warn(`[SearchService] Synthesis failed after retrieval; returning degraded references: ${degraded.reason}`);

            return degraded;
        }

        return {
            answer,
            references
        };
    }
}

export default Neo.setupClass(SearchService);
