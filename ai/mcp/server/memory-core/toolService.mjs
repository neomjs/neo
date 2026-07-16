import path                          from 'path';
import {fileURLToPath}               from 'url';
import AiConfig                      from '../../../config.mjs';
import ToolService                   from '../../ToolService.mjs';
import GraphqlService                from '../../../services/github-workflow/GraphqlService.mjs';
import PullRequestHistoryService     from '../../../services/github-workflow/PullRequestHistoryService.mjs';
import GraphService                  from '../../../services/memory-core/GraphService.mjs';
import HealthService                 from '../../../services/memory-core/HealthService.mjs';
import MemoryService                 from '../../../services/memory-core/MemoryService.mjs';
import SessionService                from '../../../services/memory-core/SessionService.mjs';
import SummaryService                from '../../../services/memory-core/SummaryService.mjs';
import MailboxService                from '../../../services/memory-core/MailboxService.mjs';
import PermissionService             from '../../../services/memory-core/PermissionService.mjs';
import WakeSubscriptionService       from '../../../services/memory-core/WakeSubscriptionService.mjs';
import TurnPresenceService           from '../../../services/memory-core/TurnPresenceService.mjs';
import MemoryCoreRecorderService     from '../../../services/memory-core/MemoryCoreRecorderService.mjs';
import {readDeploymentStateSnapshot} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {exploreLaneLandscape}        from '../../../services/graph/exploreLaneLandscape.mjs';
import {exploreMemoryHistory}        from '../../../services/memory-core/helpers/exploreMemoryHistory.mjs';
import {makeChatModelGenerate}       from '../../../services/memory-core/helpers/chatModelGenerate.mjs';
import {makeLandscapeCensusSource}   from '../../../services/graph/laneLandscapeCensusSource.mjs';
import {makeOpenWorkCensusReader}    from '../../../services/github-workflow/openWorkCensusReader.mjs';
import {synthesizeTemporalBirdView}  from '../../../services/memory-core/helpers/temporalBirdViewSynthesizer.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

const readDeploymentInspection = args => readDeploymentStateSnapshot({
    filePath    : AiConfig.orchestrator.deploymentStateBridge.snapshotPath,
    staleAfterMs: args?.staleAfterMs ?? AiConfig.orchestrator.deploymentStateBridge.staleAfterMs,
    maxBytes    : AiConfig.orchestrator.deploymentStateBridge.maxSnapshotBytes
});

// `explore_memory_history` — the Memory/session temporal Bird View runtime op. The pure composition
// (`exploreMemoryHistory`) is dependency-injected; this handler binds the impure edges at the MC server:
// the recency spine + semantic enrichment ride `MemoryService`; synthesis reuses the generation model
// already owned by `SessionService` instead of rebuilding provider config at the tool boundary; and
// the `unified` roster is the union of the who-is-online buckets (every AgentIdentity sits in exactly one).
// The real clock is injected here; the composition stays deterministic on the value it receives.
// `explore_lane_landscape` — the CURRENT-STATE Bird View, the third self-awareness context slot beside
// the two historical views. It carries no window: the historical tools answer "what happened in
// [start, end)", this one answers "what IS the structure right now", so `capturedAt` is its honest key.
// The pure composition is dependency-injected; this handler binds the impure edges at the MC server —
// the graph census reads and the live chat model. The graph handle resolves at call time (never
// captured here), so a store re-open cannot leave the census reading a dead database.
const exploreLaneLandscapeOp = () => exploreLaneLandscape({
    now : new Date(),
    deps: {
        // The census reads the source that OWNS the facts (live, cursor-walked to exhaustion); the
        // graph handle stays only for relation edges, which is the one thing it does own. A local
        // projection cannot answer a current-state question: both the graph and the synced corpus lag,
        // and neither carries assignee truth.
        ...makeLandscapeCensusSource({
            ...makeOpenWorkCensusReader({
                query : (queryString, variables) => GraphqlService.query(queryString, variables),
                config: {
                    owner       : AiConfig.owner,
                    repo        : AiConfig.repo,
                    maxLabels   : AiConfig.issueSync.maxLabelsPerIssue,
                    maxAssignees: AiConfig.issueSync.maxAssigneesPerIssue
                }
            }),
            getDb    : () => GraphService.db?.storage?.db,
            pageLimit: AiConfig.laneLandscapeCensusPageLimit,
            maxPages : AiConfig.laneLandscapeCensusMaxPages
        }),
        generate: makeChatModelGenerate({
            // SessionService is the Memory Core server's model owner and completes startup before tools
            // dispatch. Read the live model at call time; do not thread AiConfig leaves into a second builder.
            buildModel: () => SessionService.model
        })
    }
});

const exploreMemoryHistoryOp = args => exploreMemoryHistory({
    partition  : args?.partition,
    preset     : args?.preset,
    windowStart: args?.windowStart,
    windowEnd  : args?.windowEnd,
    now        : new Date(),
    deps       : {
        queryRecentTurns: MemoryService.queryRecentTurns.bind(MemoryService),
        queryMemories   : MemoryService.queryMemories.bind(MemoryService),
        generate        : makeChatModelGenerate({
            // SessionService is the Memory Core server's model owner and completes startup before tools
            // dispatch. Read the live model at call time; do not thread AiConfig leaves into a second builder.
            buildModel: () => SessionService.model
        }),
        listIdentities: async () => {
            const {online, idle, benched} = await WakeSubscriptionService.whoIsOnline();
            return [...(online || []), ...(idle || []), ...(benched || [])]
        },
        // the team-visible session-summary coverage leg — recovers the peer sessions the tenant-bound
        // recency walk structurally cannot see (query_recent_turns is caller-userId-bound)
        listSummaries: SummaryService.listSummaries.bind(SummaryService)
    }
});

// `explore_pull_request_history` keeps source ownership and synthesis ownership explicit: GitHub Workflow
// retrieves the resolved-PR census plus canonical conversations, while this Memory Core boundary injects
// the shared temporal runner and its live model. The real clock is request-scoped so the source service stays
// deterministic and never imports Memory Core helpers or inference configuration.
const explorePullRequestHistoryOp = args => PullRequestHistoryService.explorePullRequestHistory(args, {
    runTemporal: synthesizeTemporalBirdView,
    generate   : makeChatModelGenerate({
        buildModel: () => SessionService.model
    }),
    now: new Date()
});

const serviceMapping = {
    add_memory           : MemoryService          .addMemory               .bind(MemoryService),
    get_mcp_tool_handbook: toolId => toolService.getToolHandbook(toolId),
    // `SummaryService.deleteAllSummaries` stays as the tenant-safe internal primitive (the
    // multi-tenant scoped-delete guard + future gated cleanups reuse it) but is deliberately
    // NOT agent-callable: a mass-destructive op does not belong on the MCP surface, and any
    // confirmation an agent can supply is not a guard. An operator path, if ever needed,
    // routes through DestructiveOperationGuard — never through tool re-exposure.
    get_all_summaries           : SummaryService         .listSummaries           .bind(SummaryService),
    get_context_frontier        : MemoryService          .getContextFrontier      .bind(MemoryService),
    get_neighbors               : GraphService           .getNeighbors            .bind(GraphService),
    get_node                    : GraphService           .getNode                 .bind(GraphService),
    get_session_memories        : MemoryService          .listMemories            .bind(MemoryService),
    healthcheck                 : HealthService          .healthcheck             .bind(HealthService),
    mutate_frontier             : MemoryService          .mutateFrontier          .bind(MemoryService),
    pre_brief_session           : MemoryService          .preBriefSession         .bind(MemoryService),
    query_hybrid_graph          : GraphService           .queryNodeTopology       .bind(GraphService),
    query_raw_memories          : MemoryService          .queryMemories           .bind(MemoryService),
    query_recent_turns          : MemoryService          .queryRecentTurns        .bind(MemoryService),
    query_summaries             : SummaryService         .querySummaries          .bind(SummaryService),
    explore_lane_landscape      : exploreLaneLandscapeOp,
    explore_memory_history      : exploreMemoryHistoryOp,
    explore_pull_request_history: explorePullRequestHistoryOp,
    search_nodes                : GraphService           .searchNodes             .bind(GraphService),
    get_memory_core_tool_metrics:
                              MemoryCoreRecorderService.getMemoryCoreToolMetrics.bind(MemoryCoreRecorderService),
    add_message           : MailboxService         .addMessage              .bind(MailboxService),
    list_messages         : MailboxService         .listMessages            .bind(MailboxService),
    get_message           : MailboxService         .getMessage              .bind(MailboxService),
    get_rem_pipeline_state: HealthService          .getRemPipelineState     .bind(HealthService),
    get_sqlite_holder_diagnostics:
                              HealthService          .getSqliteHolderDiagnostics.bind(HealthService),
    get_deployment_state_snapshot: readDeploymentInspection,
    inspect_deployment           : readDeploymentInspection,
    mark_read                    : MailboxService         .markRead                .bind(MailboxService),
    archive_message              : MailboxService         .archiveMessage          .bind(MailboxService),
    delete_message               : MailboxService         .deleteMessage           .bind(MailboxService),
    transition_task              : MailboxService         .transitionTask          .bind(MailboxService),
    grant_permission             : PermissionService      .grantPermission         .bind(PermissionService),
    revoke_permission            : PermissionService      .revokePermission        .bind(PermissionService),
    list_permissions             : PermissionService      .listPermissions         .bind(PermissionService),
    manage_wake_subscription     : WakeSubscriptionService.manage                  .bind(WakeSubscriptionService),
    record_turn_presence         : TurnPresenceService    .recordTurnPresence      .bind(TurnPresenceService),
    who_is_online                : WakeSubscriptionService.whoIsOnline             .bind(WakeSubscriptionService),
    purge_session                : SessionService         .purgeSession            .bind(SessionService),
    resume_session               : SessionService         .validateSessionForResume.bind(SessionService),
    set_session_id               : SessionService         .setSessionId            .bind(SessionService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions     : true,
    openApiFilePath,
    serviceMapping,
    toolListDescriptionMaxLength: 120
});

const _callTool = toolService.callTool.bind(toolService);

const callTool = async (name, args, options = {}) => {
    const t0 = Date.now();

    let result, success = false, error = null;

    try {
        result  = await _callTool(name, args, options);
        success = true;
        return result;
    } catch (err) {
        error = err;
        throw err;
    } finally {
        MemoryCoreRecorderService.logToolCall({
            toolName    : name,
            args,
            result,
            success,
            error,
            failureStage: success ? null : 'dispatch',
            t0
        });
    }
};
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
