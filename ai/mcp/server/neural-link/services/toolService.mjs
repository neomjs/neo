import path              from 'path';
import {fileURLToPath}   from 'url';
import ToolService       from '../../../ToolService.mjs';
import ComponentService  from './ComponentService.mjs';
import ConnectionService from './ConnectionService.mjs';
import DataService       from './DataService.mjs';
import HealthService     from './HealthService.mjs';
import InteractionService from './InteractionService.mjs';
import RuntimeService    from './RuntimeService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    check_namespace       : RuntimeService    .checkNamespace      .bind(RuntimeService),
    get_component_property: ComponentService  .getComponentProperty.bind(ComponentService),
    get_component_tree    : ComponentService  .getComponentTree    .bind(ComponentService),
    get_computed_styles   : ComponentService  .getComputedStyles   .bind(ComponentService),
    get_console_logs      : ConnectionService .getConsoleLogs      .bind(ConnectionService),
    get_dom_rect          : ComponentService  .getDomRect          .bind(ComponentService),
    get_drag_state        : InteractionService.getDragState        .bind(InteractionService),
    get_namespace_tree    : RuntimeService    .getNamespaceTree    .bind(RuntimeService),
    get_record            : DataService       .getRecord           .bind(DataService),
    get_route_history     : RuntimeService    .getRouteHistory     .bind(RuntimeService),
    get_vdom_tree         : ComponentService  .getVdomTree         .bind(ComponentService),
    get_vnode_tree        : ComponentService  .getVnodeTree        .bind(ComponentService),
    get_window_topology   : RuntimeService    .getWindowTopology   .bind(RuntimeService),
    get_worker_topology   : RuntimeService    .getWorkerTopology   .bind(RuntimeService),
    healthcheck           : HealthService     .healthcheck         .bind(HealthService),
    inspect_state_provider: DataService       .inspectStateProvider.bind(DataService),
    inspect_store         : DataService       .inspectStore        .bind(DataService),
    list_stores           : DataService       .listStores          .bind(DataService),
    modify_state_provider : DataService       .modifyStateProvider .bind(DataService),
    query_component       : ComponentService  .queryComponent      .bind(ComponentService),
    reload_page           : RuntimeService    .reloadPage          .bind(RuntimeService),
    set_component_property: ComponentService  .setComponentProperty.bind(ComponentService),
    set_route             : RuntimeService    .setRoute            .bind(RuntimeService),
    start_ws_server       : ConnectionService .startServer         .bind(ConnectionService),
    stop_ws_server        : ConnectionService .stopServer          .bind(ConnectionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool.bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
