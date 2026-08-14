import path                          from 'path';
import {fileURLToPath}               from 'url';
import AiConfig                      from '../../../config.mjs';
import mcConfig                      from './config.mjs';
import ToolService                   from '../../ToolService.mjs';
import GraphqlService                from '../../../services/github-workflow/GraphqlService.mjs';
import PullRequestHistoryService     from '../../../services/github-workflow/PullRequestHistoryService.mjs';
import GraphService                  from '../../../services/memory-core/GraphService.mjs';
import HealthService, {foldHeavyMaintenanceStarvation} from '../../../services/memory-core/HealthService.mjs';
import MemoryService                 from '../../../services/memory-core/MemoryService.mjs';
import SessionService                from '../../../services/memory-core/SessionService.mjs';
import SummaryService                from '../../../services/memory-core/SummaryService.mjs';
import MailboxService                from '../../../services/memory-core/MailboxService.mjs';
import PermissionService             from '../../../services/memory-core/PermissionService.mjs';
import WakeSubscriptionService       from '../../../services/memory-core/WakeSubscriptionService.mjs';
import TurnPresenceService           from '../../../services/memory-core/TurnPresenceService.mjs';
import MemoryCoreRecorderService     from '../../../services/memory-core/MemoryCoreRecorderService.mjs';
import {readDeploymentStateSnapshot} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {readSandmanHandoff}          from '../../../services/memory-core/helpers/sandmanHandoffStore.mjs';
import {exploreLaneLandscape}        from '../../../services/graph/exploreLaneLandscape.mjs';
import {exploreMemoryHistory}        from '../../../services/memory-core/helpers/exploreMemoryHistory.mjs';
import {makeChatModelGenerate}       from '../../../services/memory-core/helpers/chatModelGenerate.mjs';
import {makeLandscapeCensusSource}   from '../../../services/graph/laneLandscapeCensusSource.mjs';
import {makeOpenWorkCensusReader}    from '../../../services/github-workflow/openWorkCensusReader.mjs';
import {synthesizeTemporalBirdView}  from '../../../services/memory-core/helpers/temporalBirdViewSynthesizer.mjs';
import {
    projectVectorGenerationHealth,
    resolveVectorGenerationElectionDir
}                                    from '../../../services/shared/vector/generationElectionStore.mjs';
import GitHubWorkflowConfig from '../github-workflow/config.mjs';
import MemoryCoreConfig     from './config.mjs';
import {
    admitCommunityBatch,
    areHostedCommunityToolsVisible,
    assertHostedCommunityToolAllowed,
    getHostedCommunityBoundaryRejection,
    getCommunitySourceHealth,
    hostedCommunityToolNames
} from './communityBatchTool.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

const readDeploymentInspection = args => readDeploymentStateSnapshot({
    filePath    : AiConfig.orchestrator.deploymentStateBridge.snapshotPath,
    staleAfterMs: args?.staleAfterMs ?? AiConfig.orchestrator.deploymentStateBridge.staleAfterMs,
    maxBytes    : AiConfig.orchestrator.deploymentStateBridge.maxSnapshotBytes
});

/**
 * @summary Extends the deployment inspection with an opt-in, identity-authorized mailbox
 * read-state observation while preserving the snapshot-only shape when the request is absent.
 * @param {Object} [args]
 * @returns {Promise<Object>}
 */
const inspectDeployment = async args => {
    const inspection = await readDeploymentInspection(args);

    if (!args?.mailboxReadState) {
        return inspection
    }

    return {
        ...inspection,
        mailboxReadState: await MailboxService.inspectReadState(args.mailboxReadState)
    }
};

// `get_sandman_handoff` — serves the Dream Pipeline's morning surface to agents with no repo
// checkout. The path rides the resolved `handoffFilePath` formula leaf (prod/test by
// construction; `NEO_HANDOFF_FILE_PATH` is honored inside the leaf) — never a second path source.
// The freshness default (36h, nightly cadence + slack) lives in the helper; per-call override wins.
const readSandmanHandoffTool = args => readSandmanHandoff({
    filePath    : AiConfig.handoffFilePath,
    staleAfterMs: args?.staleAfterMs
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
// the graph census reads and the live chat model. Both reads resolve through their owning service at
// call time (never captured here), so a store re-open cannot leave the census reading a dead database.
/**
 * @summary Reads the lane-landscape binding leaves from the child Provider that owns each domain.
 *
 * GitHub repository/query fan-out belongs to the GitHub Workflow child; census traversal bounds belong
 * to the Memory Core child. Reading both at call time preserves reactive overlay/env resolution and
 * fails loud when either provider is not wired, instead of masking the boundary with local defaults.
 *
 * @returns {{census: {edgeLimit: Number, maxPages: Number, pageLimit: Number}, source: {
 *   maxAssignees: Number, maxLabels: Number, owner: String, repo: String}}}
 */
const readLaneLandscapeConfig = () => ({
    census: {
        edgeLimit: MemoryCoreConfig.laneLandscapeRelationEdgeLimit,
        maxPages : MemoryCoreConfig.laneLandscapeCensusMaxPages,
        pageLimit: MemoryCoreConfig.laneLandscapeCensusPageLimit
    },
    source: {
        maxAssignees: GitHubWorkflowConfig.issueSync.maxAssigneesPerIssue,
        maxLabels   : GitHubWorkflowConfig.issueSync.maxLabelsPerIssue,
        owner       : GitHubWorkflowConfig.owner,
        repo        : GitHubWorkflowConfig.repo
    }
});

const exploreLaneLandscapeOp = () => {
    const {census, source} = readLaneLandscapeConfig();

    return exploreLaneLandscape({
        now : new Date(),
        deps: {
            // The census reads the source that OWNS the facts (live, cursor-walked to exhaustion); the graph
            // supplies only relation edges, which is the one thing it does own, through its RLS seam. A local
            // projection cannot answer a current-state question: both the graph and the synced corpus lag,
            // and neither carries assignee truth.
            ...makeLandscapeCensusSource({
                ...makeOpenWorkCensusReader({
                    query : (queryString, variables) => GraphqlService.query(queryString, variables),
                    config: source
                }),
                listEdgeRecordsByType: args => GraphService.listEdgeRecordsByType(args),
                pageLimit            : census.pageLimit,
                maxPages             : census.maxPages,
                edgeLimit            : census.edgeLimit
            }),
            generate: makeChatModelGenerate({
                // SessionService is the Memory Core server's model owner and completes startup before tools
                // dispatch. Read the live model at call time; do not thread AiConfig leaves into a second builder.
                buildModel: () => SessionService.model
            })
        }
    })
};

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
            // Every rostered identity, regardless of liveness bucket — this leg is a roster census,
            // not an availability question. `dark` and `neverConnected` were split OUT of `idle`
            // when who_is_online learned to distinguish membership from freshness; omitting them
            // here would silently shrink the census the moment an identity went quiet.
            const {online, idle, dark, neverConnected, benched} = await WakeSubscriptionService.whoIsOnline();
            return [...(online || []), ...(idle || []), ...(dark || []), ...(neverConnected || []), ...(benched || [])]
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

const ALL_FEATURES_OPERATIONAL_DETAIL = 'All features are operational';

/**
 * @summary Reconciles base Memory Core health with measured WAL and orchestrator maintenance state.
 *
 * A fresh asynchronous backlog is expected and leaves the base verdict unchanged. Once the shared
 * drain classifier reports `stalled`, or the current orchestrator bridge reports degraded backup
 * maintenance, the composed response cannot still claim every feature is operational:
 * healthy/degraded becomes degraded, an existing unhealthy verdict wins, and the details name the
 * observed cause. Stale/unavailable bridge state is explicit but cannot authorize a current backup
 * degradation. This projection is diagnostic-only and never repairs either subsystem.
 *
 * @param {Object} options
 * @param {Object} options.health Base HealthService response.
 * @param {Object} options.memoryWalDrain Measured MemoryService drain response.
 * @param {Object} options.plane Observed Memory Core plane identity.
 * @param {Object|null} [options.vectorGeneration=null] Vector-generation election health.
 * @param {Object|null} [options.deploymentInspection=null] Current orchestrator bridge inspection.
 * @returns {Object}
 */
export function composeMemoryCoreHealthcheck({
    health,
    memoryWalDrain,
    plane,
    vectorGeneration = null,
    deploymentInspection = null,
    starvationNow = Date.now(),
    starvationStaleAfterMs = null
}) {
    const
        backupHealth = deploymentInspection?.ok === true
            ? deploymentInspection.snapshot?.maintenance?.health ?? null
            : null,
        maintenance  = {
            observationStatus: deploymentInspection?.status ?? 'unavailable',
            backup           : backupHealth
        },
        response       = {...health, memoryWalDrain, plane, vectorGeneration, maintenance},
        drainStalled   = memoryWalDrain.state === 'stalled',
        backupDegraded = backupHealth?.status === 'degraded';

    let composed = response;

    if (drainStalled || backupDegraded) {
        const details = Array.isArray(health.details)
            ? health.details.filter(detail => detail !== ALL_FEATURES_OPERATIONAL_DETAIL)
            : [];

        if (drainStalled) {
            details.push(
                `Memory WAL embed drain is stalled: ${memoryWalDrain.pendingDrainDepth} pending records; ` +
                `oldest pending age ${memoryWalDrain.oldestPendingAgeMs} ms exceeds the ` +
                `${memoryWalDrain.stallThresholdMs} ms threshold.`
            )
        }

        if (backupDegraded) {
            const reasonCodes = Array.isArray(backupHealth.reasonCodes) && backupHealth.reasonCodes.length > 0
                ? backupHealth.reasonCodes.join(', ')
                : 'see maintenance.backup';

            details.push(`Backup maintenance is degraded: ${reasonCodes}.`)
        }

        composed = {
            ...response,
            status: health.status === 'unhealthy' ? 'unhealthy' : 'degraded',
            details
        }
    }

    // Heavy-maintenance starvation rides the SAME request-fresh deployment inspection and folds at
    // THIS composed surface — the MCP healthcheck tool, the Docker healthcheck, and the
    // container-health controllers — and deliberately NOT into `HealthService`'s own payload:
    // `ensureHealthy()` gates tool admission on that payload, and a starved maintenance lane must
    // never block capabilities it does not affect (semantic recall stays dispatchable while this
    // composed surface reports degraded). Per-tool-call composition makes the consumption
    // request-fresh by construction — no cache can blind the verdict. All degradation-authority
    // guards (fresh degraded receipt only; unknown/disabled/stale/unavailable never degrade;
    // unhealthy wins; the all-clear line is withdrawn) live in the pure fold.
    foldHeavyMaintenanceStarvation({
        payload     : composed,
        inspection  : deploymentInspection,
        now         : starvationNow,
        staleAfterMs: starvationStaleAfterMs
    });

    return composed
}

/**
 * @summary Accepts an A2A message at the durable WAL boundary and defers its derived graph
 * projection so graph saturation cannot withhold the write receipt.
 * @param {Object} args add_message arguments.
 * @returns {Promise<Object>}
 */
const addMessageTool = args => MailboxService.addMessage(args, {deferProjection: true});

const serviceMapping = {
    add_memory           : MemoryService          .addMemory               .bind(MemoryService),
    get_mcp_tool_handbook: toolId => toolService.getToolHandbook(toolId),
    // `SummaryService.deleteAllSummaries` stays as the tenant-safe internal primitive (the
    // multi-tenant scoped-delete guard + future gated cleanups reuse it) but is deliberately
    // NOT agent-callable: a mass-destructive op does not belong on the MCP surface, and any
    // confirmation an agent can supply is not a guard. An operator path, if ever needed,
    // routes through DestructiveOperationGuard — never through tool re-exposure.
    get_all_summaries          : SummaryService         .listSummaries           .bind(SummaryService),
    get_community_source_health: getCommunitySourceHealth,
    get_context_frontier       : MemoryService          .getContextFrontier      .bind(MemoryService),
    get_neighbors              : GraphService           .getNeighbors            .bind(GraphService),
    get_node                   : GraphService           .getNode                 .bind(GraphService),
    get_session_memories       : MemoryService          .listMemories            .bind(MemoryService),
    // Health payload + the OBSERVED plane identity: a deployment manifest's desired-vs-observed
    // comparison needs each process to REPORT what it resolved — host-side re-derivation cannot
    // populate an observed column. Read from the SAME per-server config the boot assertion
    // verified (`Server.aiConfig` === this singleton) — never a second Provider, so a custom
    // child overlay can never verify one identity and report another.
    //
    // `memoryWalDrain` is folded in here rather than becoming a new tool: "is my write visible yet?"
    // is a liveness question, and the MCP surface is capped — a dedicated drain tool would spend a
    // slot on something an existing read already answers. Without it the `add_memory` disclosure
    // would only relocate the uncertainty: a caller told "queryability is deferred" needs somewhere
    // to CONFIRM visibility rather than a caveat and no instrument.
    healthcheck                 : async args => composeMemoryCoreHealthcheck({
        health        : await HealthService.healthcheck(args),
        memoryWalDrain: await MemoryService.describeDrainState(),
        plane         : {id: mcConfig.plane.id, dataRoot: mcConfig.plane.dataRoot},
        // Fresh bridge truth only. `composeMemoryCoreHealthcheck` keeps stale/unavailable
        // observations explicit but prevents either from authorizing a backup degradation.
        deploymentInspection: await readDeploymentInspection(),
        // The starvation receipt's own checkedAt freshness reads the same deployment-state
        // authority that bounds the snapshot — one leaf governs the whole consumed surface.
        starvationStaleAfterMs: AiConfig.orchestrator.deploymentStateBridge.staleAfterMs,
        // Elected + parked vector-generation identities (never throws; `missing` on a plane that
        // has not declared an election) — acceptance for a generation cutover reads this block.
        vectorGeneration: await projectVectorGenerationHealth({
            dir: resolveVectorGenerationElectionDir({planeDataRoot: mcConfig.plane.dataRoot})
        })
    }),
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
    add_message           : addMessageTool,
    list_messages         : MailboxService         .listMessages            .bind(MailboxService),
    get_message           : MailboxService         .getMessage              .bind(MailboxService),
    get_rem_pipeline_state: HealthService          .getRemPipelineState     .bind(HealthService),
    get_sqlite_holder_diagnostics:
                              HealthService          .getSqliteHolderDiagnostics.bind(HealthService),
    get_deployment_state_snapshot: readDeploymentInspection,
    inspect_deployment           : inspectDeployment,
    get_sandman_handoff          : readSandmanHandoffTool,
    mark_read                    : MailboxService         .markRead                .bind(MailboxService),
    archive_message              : MailboxService         .archiveMessage          .bind(MailboxService),
    delete_message               : MailboxService         .deleteMessage           .bind(MailboxService),
    transition_task              : MailboxService         .transitionTask          .bind(MailboxService),
    grant_permission             : PermissionService      .grantPermission         .bind(PermissionService),
    revoke_permission            : PermissionService      .revokePermission        .bind(PermissionService),
    list_permissions             : PermissionService      .listPermissions         .bind(PermissionService),
    manage_wake_subscription     : WakeSubscriptionService.manage                  .bind(WakeSubscriptionService),
    record_turn_presence         : TurnPresenceService    .recordTurnPresence      .bind(TurnPresenceService),
    admit_community_batch        : admitCommunityBatch,
    who_is_online                : WakeSubscriptionService.whoIsOnline             .bind(WakeSubscriptionService),
    purge_session                : SessionService         .purgeSession            .bind(SessionService),
    resume_session               : SessionService         .validateSessionForResume.bind(SessionService),
    set_session_id               : SessionService         .setSessionId            .bind(SessionService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions     : true,
    compactToolSchemas          : true,
    openApiFilePath,
    serviceMapping,
    toolListDescriptionMaxLength: 120
});

const _callTool = toolService.callTool.bind(toolService);

/**
 * @summary Creates the internal Memory Core facade around one call-time transport resolver.
 *
 * Production keeps the reactive Provider read at the use site. Tests inject a closed-over literal
 * resolver into a separate facade instead of mutating the shared AiConfig singleton. The resolver
 * is never part of MCP arguments or tool options, so callers cannot forge transport authority.
 *
 * @param {Object} [dependencies]
 * @param {Function} [dependencies.resolveTransport]
 * @returns {{callTool: Function, listTools: Function}}
 */
const createTransportVisibleToolFacade = ({
    resolveTransport=() => MemoryCoreConfig.transport
} = {}) => {
    /**
     * @summary Applies hosted-transport visibility before returning Memory Core tools/list.
     * @param {Object} [options]
     * @returns {{tools: Object[], nextCursor: String|undefined}}
     */
    const listTools = ({cursor=0, limit, toolProjection} = {}) => {
        const transport = resolveTransport();

        const allTools = toolService.listTools({toolProjection}).tools.filter(tool => (
            !hostedCommunityToolNames.has(tool.name) || areHostedCommunityToolsVisible(transport)
        ));

        if (!limit) return {tools: allTools, nextCursor: undefined};

        const
            start = Number(cursor) || 0,
            end   = start + limit;

        return {
            tools     : allTools.slice(start, end),
            nextCursor: end < allTools.length ? String(end) : undefined
        }
    };

    /**
     * @summary Applies the hosted-transport guard before Memory Core tool dispatch.
     * @param {String} name
     * @param {Object} args
     * @param {Object} [options]
     * @returns {Promise<Object>}
     */
    const callTool = async (name, args, options = {}) => {
        const
            t0          = Date.now(),
            // Keep the diagnostics observer out of its own unfinished snapshot. Its completion
            // is still recorded below, preserving aggregate latency without a false active row.
            telemetryId = name === 'get_memory_core_tool_metrics'
                ? null
                : MemoryCoreRecorderService.beginToolCall({toolName: name, args, t0});

        let result, success = false, error = null;

        try {
            assertHostedCommunityToolAllowed(name, resolveTransport());
            const boundaryRejection = getHostedCommunityBoundaryRejection(name, args);

            if (boundaryRejection) {
                result  = boundaryRejection;
                success = true;
                return result
            }
            result  = await _callTool(name, args, options);
            success = true;
            return result;
        } catch (err) {
            error = err;
            throw err;
        } finally {
            MemoryCoreRecorderService.logToolCall({
                id          : telemetryId || undefined,
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

    return {callTool, listTools}
};

const {callTool, listTools} = createTransportVisibleToolFacade();

export {callTool, createTransportVisibleToolFacade, listTools, readLaneLandscapeConfig};
