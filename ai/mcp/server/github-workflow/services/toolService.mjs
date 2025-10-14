import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import {fileURLToPath} from 'url';
import * as issueService from './issueService.mjs';
import * as labelService from './labelService.mjs';
import * as pullRequestService from './pullRequestService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

let toolMapping = null;

const serviceMapping = {
    ...issueService,
    ...labelService,
    ...pullRequestService
};

/**
 * Parses the openapi.yaml file to build a mapping of tool names to service functions.
 */
function initializeToolMapping() {
    if (toolMapping) {
        return;
    }

    toolMapping = {};

    const openApiDocument = yaml.load(fs.readFileSync(openApiFilePath, 'utf8'));

    for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (operation.operationId) {
                toolMapping[operation.operationId] = {
                    path,
                    method,
                    description: operation.description,
                    handler: serviceMapping[operation.operationId]
                };
            }
        }
    }
}

/**
 * Lists all available tools.
 * @returns {object[]} A list of tool definitions.
 */
function listTools() {
    initializeToolMapping();
    return Object.entries(toolMapping).map(([name, tool]) => ({
        name: name,
        description: tool.description
    }));
}

/**
 * Calls a tool by its name with the given arguments.
 * @param {string} toolName - The name of the tool to call.
 * @param {object} args - The arguments for the tool.
 * @returns {Promise<any>} The result of the tool execution.
 */
async function callTool(toolName, args) {
    initializeToolMapping();
    const tool = toolMapping[toolName];

    if (!tool || !tool.handler) {
        throw new Error(`Tool "${toolName}" not found or not implemented.`);
    }

    // This is a simplified argument handling. A real implementation would be more robust.
    const argValues = args ? Object.values(args) : [];
    return tool.handler(...argValues);
}

export {
    listTools,
    callTool
};