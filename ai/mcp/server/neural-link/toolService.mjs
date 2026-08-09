import path               from 'path';
import {fileURLToPath}    from 'url';
import ToolService        from '../../ToolService.mjs';
import ComponentService   from '../../../services/neural-link/ComponentService.mjs';
import ConnectionService  from '../../../services/neural-link/ConnectionService.mjs';
import DataService        from '../../../services/neural-link/DataService.mjs';
import DockService        from '../../../services/neural-link/DockService.mjs';
import HealthService      from '../../../services/neural-link/HealthService.mjs';
import InstanceService    from '../../../services/neural-link/InstanceService.mjs';
import InteractionService from '../../../services/neural-link/InteractionService.mjs';
import RuntimeService     from '../../../services/neural-link/RuntimeService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

import {getCurrentTurnId} from './Server.mjs';
import RecorderService    from '../../../services/neural-link/RecorderService.mjs';

const serviceMapping = {
    abort_transaction            : InstanceService   .abortTransaction          .bind(InstanceService),
    begin_transaction            : InstanceService   .beginTransaction          .bind(InstanceService),
    call_method                  : InstanceService   .callMethod              .bind(InstanceService),
    check_namespace              : RuntimeService    .checkNamespace            .bind(RuntimeService),
    close_window                 : RuntimeService    .closeWindow                .bind(RuntimeService),
    commit_transaction           : InstanceService   .commitTransaction         .bind(InstanceService),
    create_component             : ComponentService  .createComponent           .bind(ComponentService),
    create_instance              : InstanceService   .createInstance            .bind(InstanceService),
    capture_perspective          : DockService       .capturePerspective        .bind(DockService),
    diff_dock_topology           : DockService       .diffDockTopology          .bind(DockService),
    execute_dock_operation       : DockService       .executeDockOperation      .bind(DockService),
    find_instances               : InstanceService   .findInstances             .bind(InstanceService),
    focus_window                 : RuntimeService    .focusWindow               .bind(RuntimeService),
    get_component_tree           : ComponentService  .getComponentTree          .bind(ComponentService),
    get_computed_styles          : ComponentService  .getComputedStyles         .bind(ComponentService),
    get_console_logs             : ConnectionService .getConsoleLogs            .bind(ConnectionService),
    get_dom_event_listeners      : RuntimeService    .getDomEventListeners      .bind(RuntimeService),
    get_dom_event_summary        : RuntimeService    .getDomEventSummary        .bind(RuntimeService),
    get_dock_topology            : DockService       .getDockTopology           .bind(DockService),
    get_dom_rect                 : ComponentService  .getDomRect                .bind(ComponentService),
    get_drag_state               : InteractionService.getDragState              .bind(InteractionService),
    get_drag_trace               : InteractionService.getDragTrace              .bind(InteractionService),
    get_instance_properties      : InstanceService   .getInstanceProperties     .bind(InstanceService),
    get_mcp_tool_handbook        : toolId => toolService.getToolHandbook(toolId),
    get_method_source            : RuntimeService    .getMethodSource           .bind(RuntimeService),
    get_namespace_tree           : RuntimeService    .getNamespaceTree          .bind(RuntimeService),
    get_record                   : DataService       .getRecord                 .bind(DataService),
    get_route_history            : RuntimeService    .getRouteHistory           .bind(RuntimeService),
    get_window_topology          : RuntimeService    .getWindowTopology         .bind(RuntimeService),
    get_worker_topology          : RuntimeService    .getWorkerTopology         .bind(RuntimeService),
    healthcheck                  : HealthService     .healthcheck               .bind(HealthService),
    highlight_component          : InteractionService.highlightComponent        .bind(InteractionService),
    inspect_class                : RuntimeService    .inspectClass              .bind(RuntimeService),
    inspect_component_render_tree: ComponentService  .inspectComponentRenderTree.bind(ComponentService),
    inspect_state_provider       : DataService       .inspectStateProvider      .bind(DataService),
    inspect_store                : DataService       .inspectStore              .bind(DataService),
    list_perspectives            : DockService       .listPerspectives          .bind(DockService),
    list_stores                  : DataService       .listStores                .bind(DataService),
    list_transactions            : InstanceService   .listTransactions          .bind(InstanceService),
    manage_connection            : ConnectionService .manageConnection          .bind(ConnectionService),
    manage_neo_config            : RuntimeService    .manageNeoConfig           .bind(RuntimeService),
    modify_state_provider        : DataService       .modifyStateProvider       .bind(DataService),
    observe_motion               : InteractionService.observeMotion             .bind(InteractionService),
    open_component_window        : RuntimeService    .openComponentWindow       .bind(RuntimeService),
    patch_code                   : RuntimeService    .patchCode                 .bind(RuntimeService),
    position_window              : RuntimeService    .positionWindow            .bind(RuntimeService),
    query_component              : ComponentService  .queryComponent            .bind(ComponentService),
    query_vdom                   : ComponentService  .queryVdom                 .bind(ComponentService),
    redo                         : InstanceService   .redo                      .bind(InstanceService),
    reload_page                  : RuntimeService    .reloadPage                .bind(RuntimeService),
    remove_component             : ComponentService  .removeComponent           .bind(ComponentService),
    replay_transaction           : InstanceService   .replayTransaction         .bind(InstanceService),
    restore_perspective          : DockService       .restorePerspective        .bind(DockService),
    save_transaction             : InstanceService   .saveTransaction           .bind(InstanceService),
    set_instance_properties      : InstanceService   .setInstanceProperties     .bind(InstanceService),
    set_route                    : RuntimeService    .setRoute                  .bind(RuntimeService),
    simulate_event               : InteractionService.simulateEvent             .bind(InteractionService),
    undo                         : InstanceService   .undo                      .bind(InstanceService),
    verify_component_consistency : InteractionService.verifyComponentConsistency.bind(InteractionService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions     : true,
    compactToolSchemas          : true,
    openApiFilePath,
    serviceMapping,
    toolListDescriptionMaxLength: 120
});

const _callTool = toolService.callTool.bind(toolService);

const callTool = async (name, args, options={}) => {
    const t0        = Date.now();
    const seqId     = `${ConnectionService.agentId || 'unknown'}_${getCurrentTurnId()}`;
    const sessionId = args?.sessionId ?? ConnectionService.getDefaultSessionId();
    const appName   = ConnectionService.sessionData.get(sessionId)?.appName ?? null;

    let result, success = 0;
    try {
        result  = await _callTool(name, args, options);
        success = 1;
        return result;
    } catch (err) {
        result = { error: err.message };
        throw err;
    } finally {
        let safeArgs   = '{}';
        let safeResult = 'null';
        try {
            safeArgs = JSON.stringify(args ?? {});
        } catch (e) {
            safeArgs = JSON.stringify({ error: 'Unserializable Arguments' });
        }

        try {
            safeResult = JSON.stringify(result ?? null);
        } catch (e) {
            safeResult = JSON.stringify({ error: 'Unserializable Result' });
        }

        RecorderService.log({
            agent_id   : ConnectionService.agentId || 'unknown',
            session_id : sessionId,
            sequence_id: seqId,
            timestamp  : t0,
            tool       : name,
            args       : safeArgs,
            result     : safeResult,
            success,
            duration_ms: Date.now() - t0,
            app_name   : appName
        });
    }
};

const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
