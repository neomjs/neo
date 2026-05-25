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
const ingestToolName  = 'ingest_source_files';

/**
 * @summary Normalizes optional MCP server prefixes before transport-gating tool names.
 * @param {String} toolName The requested MCP tool name.
 * @returns {String} The effective OpenAPI operation id.
 */
const getEffectiveToolName = toolName => {
    const lastDoubleUnderscoreIndex = toolName.lastIndexOf('__');

    return lastDoubleUnderscoreIndex !== -1
        ? toolName.substring(lastDoubleUnderscoreIndex + 2)
        : toolName;
};

/**
 * @summary Returns true when the KB MCP server is in its remote StreamableHTTP profile.
 * @returns {Boolean} True when remote tenant push clients may call `ingest_source_files`.
 */
const isRemoteIngestTransport = () => aiConfig.transport === 'sse';

/**
 * @summary Fails closed when a local stdio client tries to invoke the remote push facade.
 * @param {String} toolName The requested MCP tool name.
 */
const assertToolTransportAllowed = toolName => {
    if (getEffectiveToolName(toolName) === ingestToolName && !isRemoteIngestTransport()) {
        throw new Error(
            '`ingest_source_files` is only exposed when the Knowledge Base MCP server runs ' +
            'with `transport: "sse"` (StreamableHTTP). Use `npm run ai:ingest-tenant` or ' +
            'direct service ingestion for local stdio workflows.'
        );
    }
};

/**
 * @summary Applies the KB transport visibility policy before returning MCP tools/list.
 * @param {Object} [options]
 * @param {Number|String} [options.cursor=0]
 * @param {Number} [options.limit]
 * @returns {{tools: Object[], nextCursor: String|undefined}}
 */
const listTransportVisibleTools = ({cursor=0, limit} = {}) => {
    const allTools = toolService.listTools().tools.filter(tool => (
        tool.name !== ingestToolName || isRemoteIngestTransport()
    ));

    if (!limit) {
        return {
            tools     : allTools,
            nextCursor: undefined
        };
    }

    const
        start      = Number(cursor) || 0,
        end        = start + limit,
        toolsSlice = allTools.slice(start, end),
        nextCursor = end < allTools.length ? String(end) : undefined;

    return {
        tools: toolsSlice,
        nextCursor
    };
};

/**
 * @summary MCP facade for `KnowledgeBaseIngestionService.ingestSourceFiles`.
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
 * volume is knowable from the input alone, keeping service-layer ingestion logic
 * unchanged and transport policy localized to the MCP facade.
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
    // MCP dispatch marks `viaMcp: true` so VectorService.embed can apply the synchronous
    // work-volume gate. CLI invocations call DatabaseService.syncDatabase directly without
    // `viaMcp`, preserving explicit operator opt-in to long-running work.
    manage_knowledge_base: args => DatabaseService.manageKnowledgeBase({...args, viaMcp: true}),
    // Remote tenant ingestion applies the MCP work-volume gate before service dispatch.
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
        assertToolTransportAllowed(name);
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

const listTools = listTransportVisibleTools;

export {callTool, ingestSourceFilesViaMcp, listTools};
