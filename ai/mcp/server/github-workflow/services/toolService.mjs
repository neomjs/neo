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
 * Converts OpenAPI parameters and requestBody into a JSON Schema inputSchema.
 * @param {object} operation - The OpenAPI operation object.
 * @returns {object} A JSON Schema object for the input.
 */
function buildInputSchema(operation) {
    const schema = {
        type: 'object',
        properties: {},
        required: []
    };

    // Handle parameters (path, query, header, cookie)
    if (operation.parameters) {
        for (const param of operation.parameters) {
            schema.properties[param.name] = {
                type: param.schema.type,
                description: param.description
            };
            if (param.required) {
                schema.required.push(param.name);
            }
        }
    }

    // Handle requestBody
    if (operation.requestBody && operation.requestBody.content && operation.requestBody.content['application/json']) {
        const requestBodySchema = operation.requestBody.content['application/json'].schema;
        // Assuming requestBody is a simple object for now
        if (requestBodySchema.properties) {
            for (const [propName, propSchema] of Object.entries(requestBodySchema.properties)) {
                schema.properties[propName] = {
                    type: propSchema.type,
                    description: propSchema.description
                };
                if (requestBodySchema.required && requestBodySchema.required.includes(propName)) {
                    schema.required.push(propName);
                }
            }
        }
    }

    return schema;
}

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
                    name: operation.operationId,
                    title: operation.summary || operation.operationId,
                    description: operation.description || operation.summary,
                    inputSchema: buildInputSchema(operation),
                    // outputSchema: buildOutputSchema(operation), // To be implemented later
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
    return Object.values(toolMapping).map(tool => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema
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

    // Dynamically extract arguments based on the inputSchema
    const handlerArgs = [];
    const inputSchema = tool.inputSchema;

    if (inputSchema && inputSchema.properties) {
        for (const propName of Object.keys(inputSchema.properties)) {
            // For now, we assume the order of properties in inputSchema.properties
            // matches the order of arguments expected by the handler function.
            // This is a simplification and might need refinement for complex cases.
            handlerArgs.push(args[propName]);
        }
    }

    return tool.handler(...handlerArgs);
}

export {
    listTools,
    callTool
};