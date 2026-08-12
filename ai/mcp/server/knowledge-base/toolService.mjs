import DatabaseService               from '../../../services/knowledge-base/DatabaseService.mjs';
import DocumentService               from '../../../services/knowledge-base/DocumentService.mjs';
import HealthService                 from '../../../services/knowledge-base/HealthService.mjs';
import IngestionService              from '../../../services/knowledge-base/IngestionService.mjs';
import KBRecorderService             from '../../../services/knowledge-base/KBRecorderService.mjs';
import QueryService                  from '../../../services/knowledge-base/QueryService.mjs';
import SearchService                 from '../../../services/knowledge-base/SearchService.mjs';
import ToolService                   from '../../ToolService.mjs';
import AiConfig                      from '../../../config.mjs';
import kbConfig                      from './config.mjs';
import {readDeploymentStateSnapshot} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {
    projectVectorGenerationHealth,
    resolveVectorGenerationElectionDir
}                                    from '../../../services/shared/vector/generationElectionStore.mjs';
import {
    assertToolTransportAllowed,
    ingestSourceFilesViaMcp,
    ingestToolName,
    isIngestSourceFilesToolVisible
} from './ingestSourceFilesTool.mjs';

const readDeploymentInspection = args => readDeploymentStateSnapshot({
    filePath    : AiConfig.orchestrator.deploymentStateBridge.snapshotPath,
    staleAfterMs: args?.staleAfterMs ?? AiConfig.orchestrator.deploymentStateBridge.staleAfterMs,
    maxBytes    : AiConfig.orchestrator.deploymentStateBridge.maxSnapshotBytes
});

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
    // Health payload + the OBSERVED plane identity (per-process emission for the deployment
    // manifest's observed column). Read from the SAME per-server config the boot assertion
    // verified (`Server.aiConfig` === this singleton) — never a second Provider, so a custom
    // child overlay can never verify one identity and report another.
    healthcheck                  : async () => ({
        ...await HealthService.healthcheck(),
        plane           : {id: kbConfig.plane.id, dataRoot: kbConfig.plane.dataRoot},
        // Elected + parked vector-generation identities (never throws; `missing` on a plane that
        // has not declared an election) — acceptance for a generation cutover reads this block.
        vectorGeneration: await projectVectorGenerationHealth({
            dir: resolveVectorGenerationElectionDir({planeDataRoot: kbConfig.plane.dataRoot})
        })
    }),
    get_deployment_state_snapshot: readDeploymentInspection,
    inspect_deployment           : readDeploymentInspection,
    get_ingestion_progress       : IngestionService        .getIngestionProgress.bind(IngestionService),
    list_documents               : DocumentService         .listDocuments      .bind(DocumentService),
    list_agent_faqs              : KBRecorderService       .listAgentFaqs      .bind(KBRecorderService),
    // MCP dispatch marks `viaMcp: true` so VectorService.embed can apply the synchronous
    // work-volume gate. CLI invocations call DatabaseService.syncDatabase directly without
    // `viaMcp`, preserving explicit operator opt-in to long-running work.
    manage_knowledge_base: args => DatabaseService.manageKnowledgeBase({...args, viaMcp: true}),
    // Remote tenant ingestion applies the MCP work-volume gate before service dispatch.
    ingest_source_files: ingestSourceFilesViaMcp,
    query_documents    : QueryService            .queryDocuments     .bind(QueryService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions: true,
    compactToolSchemas     : true,
    // The server config owns the OpenAPI-contract path (default + the test-isolation env
    // binding) — consumed at the use site, never re-derived from env here.
    openApiFilePath             : kbConfig.openApiPath,
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
