import path                     from 'path';
import {fileURLToPath}          from 'url';
import DatabaseService          from './DatabaseService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import DocumentService          from './DocumentService.mjs';
import HealthService            from './HealthService.mjs';
import KBRecorderService        from './KBRecorderService.mjs';
import QueryService             from './QueryService.mjs';
import SearchService            from './SearchService.mjs';
import ToolService              from '../../../ToolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

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

export {callTool, listTools};
