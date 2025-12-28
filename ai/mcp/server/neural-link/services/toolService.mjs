import path              from 'path';
import {fileURLToPath}   from 'url';
import ToolService       from '../../../ToolService.mjs';
import ConnectionService from './ConnectionService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    get_component_property: ConnectionService.getComponentProperty.bind(ConnectionService),
    get_component_tree    : ConnectionService.getComponentTree.bind(ConnectionService),
    get_vdom_tree         : ConnectionService.getVdomTree.bind(ConnectionService),
    get_vnode_tree        : ConnectionService.getVnodeTree.bind(ConnectionService),
    get_window_topology   : ConnectionService.getWindowTopology.bind(ConnectionService),
    get_worker_topology   : ConnectionService.getWorkerTopology.bind(ConnectionService),
    reload_page           : ConnectionService.reloadPage.bind(ConnectionService),
    set_component_property: ConnectionService.setComponentProperty.bind(ConnectionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool.bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
