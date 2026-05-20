import path                          from 'path';
import {fileURLToPath}               from 'url';
import aiConfig                      from './config.mjs';
import DatabaseService               from '../../../services/knowledge-base/DatabaseService.mjs';
import DatabaseLifecycleService      from '../../../services/knowledge-base/DatabaseLifecycleService.mjs';
import DocumentService               from '../../../services/knowledge-base/DocumentService.mjs';
import HealthService                 from '../../../services/knowledge-base/HealthService.mjs';
import KBRecorderService             from '../../../services/knowledge-base/KBRecorderService.mjs';
import KnowledgeBaseIngestionService from '../../../services/knowledge-base/KnowledgeBaseIngestionService.mjs';
import QueryService                  from '../../../services/knowledge-base/QueryService.mjs';
import SearchService                 from '../../../services/knowledge-base/SearchService.mjs';
import ToolService                   from '../../ToolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
/** @anchor test-isolation - ENV override to prevent parallel test mutations from corrupting the canonical file. Easily extensible to other servers via NEO_AI_MCP_<SERVER>_OPENAPI_PATH. */
const openApiFilePath = process.env.NEO_AI_MCP_KB_OPENAPI_PATH || path.join(__dirname, 'openapi.yaml');

/**
 * @summary MCP facade for `KnowledgeBaseIngestionService.ingestSourceFiles` — applies the
 * #10572 work-volume gate before dispatch.
 *
 * An agent-initiated `ingest_source_files` push embeds synchronously; an oversized batch
 * would freeze the calling agent. This facade counts the batch volume up-front and, when
 * it exceeds `aiConfig.mcpSyncMaxChunks` (default 50), refuses with a structured
 * `KB_INGEST_VOLUME_EXCEEDED` payload instead of dispatching to the service.
 *
 * Batch volume = the summed `parsedChunks` length across `files`, counting each raw
 * (un-parsed) file as 1. Raw files are chunked server-side, so a small batch of large
 * raw files can still exceed the threshold post-parse — the gate is a coarse up-front
 * guard, not an exact post-parse count.
 *
 * The gate lives at the MCP facade (not threaded into the service) because the batch
 * volume is knowable from the input alone, and #11634 keeps service-layer ingestion
 * logic (Phase 2A `KnowledgeBaseIngestionService`) untouched.
 *
 * @param {Object}    args            The `ingest_source_files` tool envelope.
 * @param {String}   [args.tenantId]  Authenticated tenant id.
 * @param {Object[]} [args.files]     Raw file payloads or client-side parsed records.
 * @returns {Promise<Object>} The `KnowledgeBaseIngestionService.ingestSourceFiles` summary,
 *     OR a `{error, message, code: 'KB_INGEST_VOLUME_EXCEEDED', bulkPath, batchSize, threshold}`
 *     refusal when the work-volume gate fires.
 * @see https://github.com/neomjs/neo/issues/11634
 * @see https://github.com/neomjs/neo/issues/10572
 */
const ingestSourceFilesViaMcp = async args => {
    const
        files     = Array.isArray(args?.files) ? args.files : [],
        batchSize = files.reduce((sum, file) => sum + (Array.isArray(file?.parsedChunks) ? file.parsedChunks.length : 1), 0),
        threshold = aiConfig.mcpSyncMaxChunks ?? 50;

    if (batchSize > threshold) {
        return {
            error    : 'KB ingest work volume exceeds MCP-callable threshold',
            message  : `Batch volume ${batchSize} exceeds the MCP-synchronous threshold ${threshold}. ` +
                       `Re-invoke ingest_source_files with at most ${threshold} files/chunks per call; ` +
                       `a tenant-scoped bulk ingestion facade is planned (Phase 2C).`,
            code     : 'KB_INGEST_VOLUME_EXCEEDED',
            bulkPath : null,
            batchSize,
            threshold
        };
    }

    return KnowledgeBaseIngestionService.ingestSourceFiles(args);
};

const serviceMapping = {
    ask_knowledge_base   : SearchService           .ask                .bind(SearchService),
    get_class_hierarchy  : QueryService            .getClassHierarchy  .bind(QueryService),
    get_document_by_id   : DocumentService         .getDocumentById    .bind(DocumentService),
    healthcheck          : HealthService           .healthcheck        .bind(HealthService),
    list_documents       : DocumentService         .listDocuments      .bind(DocumentService),
    list_agent_faqs      : KBRecorderService       .listAgentFaqs      .bind(KBRecorderService),
    manage_database      : DatabaseLifecycleService.manageDatabase     .bind(DatabaseLifecycleService),
    // #10572: dispatch wrapper marks `viaMcp: true` so VectorService.embed can apply the
    // work-volume gate. CLI invocations (via `npm run ai:sync-kb`) call DatabaseService.syncDatabase
    // directly without `viaMcp`, bypassing the gate — explicit opt-in to long-running work.
    manage_knowledge_base: args => DatabaseService.manageKnowledgeBase({...args, viaMcp: true}),
    // #11634: facade applies the #10572 work-volume gate before dispatch — see ingestSourceFilesViaMcp.
    ingest_source_files  : ingestSourceFilesViaMcp,
    query_documents      : QueryService            .queryDocuments     .bind(QueryService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const _callTool = toolService.callTool.bind(toolService);

const callTool = async (name, args) => {
    const
        t0        = Date.now(),
        agentId   = process.env.NEO_AGENT_ID || process.env.USER || 'unknown',
        sessionId = args?.sessionId || process.env.NEO_SESSION_ID || null,
        seqId     = `${agentId}_${t0}`;

    let result, success = 0;

    try {
        result  = await _callTool(name, args);
        success = 1;
        return result;
    } catch (err) {
        result = {error: err.message};
        throw err;
    } finally {
        KBRecorderService.log({
            agent_id   : agentId,
            session_id : sessionId,
            sequence_id: seqId,
            timestamp  : t0,
            tool       : name,
            args,
            result,
            success,
            duration_ms: Date.now() - t0
        });
    }
};

const listTools = toolService.listTools.bind(toolService);

export {callTool, ingestSourceFilesViaMcp, listTools};
