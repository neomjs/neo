import path               from 'path';
import {fileURLToPath}    from 'url';
import ToolService        from '../../../ToolService.mjs';
import ComponentService   from './ComponentService.mjs';
import ConnectionService  from './ConnectionService.mjs';
import DataService        from './DataService.mjs';
import HealthService      from './HealthService.mjs';
import InstanceService    from './InstanceService.mjs';
import InteractionService from './InteractionService.mjs';
import RuntimeService     from './RuntimeService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

import {getCurrentTurnId} from '../Server.mjs';
import RecorderService    from './RecorderService.mjs';

const serviceMapping = {
    check_namespace              : RuntimeService    .checkNamespace            .bind(RuntimeService),
    find_instances               : InstanceService   .findInstances             .bind(InstanceService),
    get_component_tree           : ComponentService  .getComponentTree          .bind(ComponentService),
    get_computed_styles          : ComponentService  .getComputedStyles         .bind(ComponentService),
    get_console_logs             : ConnectionService .getConsoleLogs            .bind(ConnectionService),
    get_dom_event_listeners      : RuntimeService    .getDomEventListeners      .bind(RuntimeService),
    get_dom_event_summary        : RuntimeService    .getDomEventSummary        .bind(RuntimeService),
    get_dom_rect                 : ComponentService  .getDomRect                .bind(ComponentService),
    get_drag_state               : InteractionService.getDragState              .bind(InteractionService),
    get_instance_properties      : InstanceService   .getInstanceProperties     .bind(InstanceService),
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
    list_stores                  : DataService       .listStores                .bind(DataService),
    manage_connection            : ConnectionService .manageConnection          .bind(ConnectionService),
    manage_neo_config            : RuntimeService    .manageNeoConfig           .bind(RuntimeService),
    modify_state_provider        : DataService       .modifyStateProvider       .bind(DataService),
    patch_code                   : RuntimeService    .patchCode                 .bind(RuntimeService),
    query_component              : ComponentService  .queryComponent            .bind(ComponentService),
    query_vdom                   : ComponentService  .queryVdom                 .bind(ComponentService),
    reload_page                  : RuntimeService    .reloadPage                .bind(RuntimeService),
    set_instance_properties      : InstanceService   .setInstanceProperties     .bind(InstanceService),
    set_route                    : RuntimeService    .setRoute                  .bind(RuntimeService),
    simulate_event               : InteractionService.simulateEvent             .bind(InteractionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const _callTool = toolService.callTool.bind(toolService);

const callTool = async (name, args) => {
    const t0        = Date.now();
    const seqId     = `${ConnectionService.agentId || 'unknown'}_${getCurrentTurnId()}`;
    const sessionId = args?.sessionId ?? ConnectionService.getDefaultSessionId();
    const appName   = ConnectionService.sessionData.get(sessionId)?.appName ?? null;

    let result, success = 0;
    try {
        result  = await _callTool(name, args);
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
