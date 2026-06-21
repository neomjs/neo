import path              from 'path';
import {fileURLToPath}   from 'url';
import DatabaseService   from '../../../services/knowledge-base/DatabaseService.mjs';
import DocumentService   from '../../../services/knowledge-base/DocumentService.mjs';
import HealthService     from '../../../services/knowledge-base/HealthService.mjs';
import KBRecorderService from '../../../services/knowledge-base/KBRecorderService.mjs';
import QueryService      from '../../../services/knowledge-base/QueryService.mjs';
import SearchService     from '../../../services/knowledge-base/SearchService.mjs';
import ToolService       from '../../ToolService.mjs';
import {
    assertToolTransportAllowed,
    ingestSourceFilesViaMcp,
    ingestToolName,
    isIngestSourceFilesToolVisible
} from './ingestSourceFilesTool.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
/** @anchor test-isolation - ENV override to prevent parallel test mutations from corrupting the canonical file. Easily extensible to other servers via NEO_AI_MCP_<SERVER>_OPENAPI_PATH. */
const openApiFilePath = process.env.NEO_AI_MCP_KB_OPENAPI_PATH || path.join(__dirname, 'openapi.yaml');

/**
 * @summary Applies the KB transport visibility policy before returning MCP tools/list.
 * @param {Object} [options]
 * @param {Number|String} [options.cursor=0]
 * @param {Number} [options.limit]
 * @returns {{tools: Object[], nextCursor: String|undefined}}
 */
const listTransportVisibleTools = ({cursor=0, limit} = {}) => {
    const allTools = toolService.listTools().tools.filter(tool => (
        tool.name !== ingestToolName || isIngestSourceFilesToolVisible()
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

const serviceMapping = {
    ask_knowledge_base   : SearchService           .ask                .bind(SearchService),
    get_class_hierarchy  : QueryService            .getClassHierarchy  .bind(QueryService),
    get_document_by_id   : DocumentService         .getDocumentById    .bind(DocumentService),
    get_mcp_tool_handbook: toolId => toolService.getToolHandbook(toolId),
    healthcheck          : HealthService           .healthcheck        .bind(HealthService),
    list_documents       : DocumentService         .listDocuments      .bind(DocumentService),
    list_agent_faqs      : KBRecorderService       .listAgentFaqs      .bind(KBRecorderService),
    // MCP dispatch marks `viaMcp: true` so VectorService.embed can apply the synchronous
    // work-volume gate. CLI invocations call DatabaseService.syncDatabase directly without
    // `viaMcp`, preserving explicit operator opt-in to long-running work.
    manage_knowledge_base: args => DatabaseService.manageKnowledgeBase({...args, viaMcp: true}),
    // Remote tenant ingestion applies the MCP work-volume gate before service dispatch.
    ingest_source_files  : ingestSourceFilesViaMcp,
    query_documents      : QueryService            .queryDocuments     .bind(QueryService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions    : true,
    openApiFilePath,
    serviceMapping,
    toolListDescriptionMaxLength: 120
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
