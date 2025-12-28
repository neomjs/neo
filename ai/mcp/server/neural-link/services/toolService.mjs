import path              from 'path';
import {fileURLToPath}   from 'url';
import ToolService       from '../../../ToolService.mjs';
import ComponentService  from './ComponentService.mjs';
import ConnectionService from './ConnectionService.mjs';
import HealthService     from './HealthService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    get_component_property: ComponentService.getComponentProperty.bind(ComponentService),
    get_component_tree    : ComponentService.getComponentTree.bind(ComponentService),
    get_drag_state        : ConnectionService.getDragState.bind(ConnectionService),
    get_vdom_tree         : ComponentService.getVdomTree.bind(ComponentService),
    get_vnode_tree        : ComponentService.getVnodeTree.bind(ComponentService),
    get_window_topology   : ConnectionService.getWindowTopology.bind(ConnectionService),
    get_worker_topology   : ConnectionService.getWorkerTopology.bind(ConnectionService),
    healthcheck           : HealthService.healthcheck.bind(HealthService),
    reload_page           : ConnectionService.reloadPage.bind(ConnectionService),
    set_component_property: ComponentService.setComponentProperty.bind(ComponentService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool.bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
