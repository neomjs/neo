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
let allTools = null;

const serviceMapping = {
    'list_labels': labelService.listLabels,
    'list_pull_requests': pullRequestService.listPullRequests,
    'checkout_pull_request': pullRequestService.checkoutPullRequest,
    'get_pull_request_diff': pullRequestService.getPullRequestDiff,
    'create_comment': pullRequestService.createComment,
    'get_conversation': pullRequestService.getConversation,
    'add_labels': issueService.addLabels,
    'remove_labels': issueService.removeLabels
};

function buildInputSchema(operation) {
    const schema = {
        type: 'object',
        properties: {},
        required: []
    };

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

    if (operation.requestBody && operation.requestBody.content && operation.requestBody.content['application/json']) {
        const requestBodySchema = operation.requestBody.content['application/json'].schema;
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

function initializeToolMapping() {
    if (toolMapping) {
        return;
    }

    toolMapping = {};
    allTools = [];

    const openApiDocument = yaml.load(fs.readFileSync(openApiFilePath, 'utf8'));

    for (const pathItem of Object.values(openApiDocument.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId) {
                const toolName = operation.operationId;
                const argNames = (operation.parameters || []).map(p => p.name);
                if (operation.requestBody) {
                    const props = Object.keys(operation.requestBody.content['application/json'].schema.properties);
                    argNames.push(...props);
                }

                const tool = {
                    name: toolName,
                    title: operation.summary || toolName,
                    description: operation.description || operation.summary,
                    inputSchema: buildInputSchema(operation),
                    argNames: argNames,
                    handler: serviceMapping[toolName]
                };

                toolMapping[toolName] = tool;
                allTools.push(tool);
            }
        }
    }
}

function listTools({ cursor = 0, limit } = {}) {
    initializeToolMapping();

    if (!limit) {
        return {
            tools: allTools,
            nextCursor: null
        };
    }
    
    const start = cursor;
    const end = start + limit;
    const toolsSlice = allTools.slice(start, end);

    const nextCursor = end < allTools.length ? end : null;

    return {
        tools: toolsSlice,
        nextCursor: nextCursor
    };
}

async function callTool(toolName, args) {
    initializeToolMapping();
    const tool = toolMapping[toolName];

    if (!tool || !tool.handler) {
        throw new Error(`Tool "${toolName}" not found or not implemented.`);
    }

    if (toolName === 'list_pull_requests') {
        return tool.handler(args);
    }

    const handlerArgs = tool.argNames.map(name => args[name]);
    return tool.handler(...handlerArgs);
}

export {
    listTools,
    callTool
};