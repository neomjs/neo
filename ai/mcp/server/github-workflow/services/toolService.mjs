import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fileURLToPath } from 'url';
import * as issueService from './issueService.mjs';
import * as labelService from './labelService.mjs';
import * as pullRequestService from './pullRequestService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

let toolMapping = null;
let allToolsForListing = null;

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

function buildZodSchema(operation) {
    const shape = {};
    if (operation.parameters) {
        for (const param of operation.parameters) {
            let schema;
            switch (param.schema.type) {
                case 'integer':
                    schema = z.number().int();
                    break;
                case 'string':
                    schema = z.string();
                    break;
                case 'boolean':
                    schema = z.boolean();
                    break;
                default:
                    schema = z.any();
            }
            if (!param.required) {
                schema = schema.optional();
            }
            shape[param.name] = schema.describe(param.description);
        }
    }

    if (operation.requestBody?.content?.['application/json']?.schema?.properties) {
        const { properties, required = [] } = operation.requestBody.content['application/json'].schema;
        for (const [propName, propSchema] of Object.entries(properties)) {
            let schema;
            switch (propSchema.type) {
                case 'string':
                    schema = z.string();
                    break;
                case 'array':
                    schema = z.array(z.string()); // Assuming array of strings for now
                    break;
                default:
                    schema = z.any();
            }
            if (!required.includes(propName)) {
                schema = schema.optional();
            }
            shape[propName] = schema.describe(propSchema.description);
        }
    }
    return z.object(shape);
}

function resolveRef(doc, ref) {
    const parts = ref.substring(2).split('/'); // remove '#/' and split
    return parts.reduce((acc, part) => acc[part], doc);
}

function buildZodSchemaFromResponse(doc, schema) {
    if (schema.$ref) {
        return buildZodSchemaFromResponse(doc, resolveRef(doc, schema.$ref));
    }

    if (schema.type === 'object') {
        const shape = {};
        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                shape[propName] = buildZodSchemaFromResponse(doc, propSchema);
            }
        }
        return z.object(shape);
    } else if (schema.type === 'array') {
        return z.array(buildZodSchemaFromResponse(doc, schema.items));
    } else if (schema.type === 'string') {
        return z.string();
    } else if (schema.type === 'integer') {
        return z.number().int();
    } else if (schema.type === 'boolean') {
        return z.boolean();
    } else {
        return z.any();
    }
}

function buildOutputZodSchema(doc, operation) {
    const response = operation.responses?.['200'] || operation.responses?.['201'];
    const schema = response?.content?.['application/json']?.schema;

    if (schema) {
        return buildZodSchemaFromResponse(doc, schema);
    }
    
    if (response?.content?.['text/plain']) {
        return z.string();
    }

    return null;
}

function initializeToolMapping() {
    if (toolMapping) {
        return;
    }

    toolMapping = {};
    allToolsForListing = [];

    const openApiDocument = yaml.load(fs.readFileSync(openApiFilePath, 'utf8'));

    for (const pathItem of Object.values(openApiDocument.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId) {
                const toolName = operation.operationId;
                const inputZodSchema = buildZodSchema(operation);
                const inputJsonSchema = zodToJsonSchema(inputZodSchema);

                const outputZodSchema = buildOutputZodSchema(openApiDocument, operation);
                let outputJsonSchema = null;
                if (outputZodSchema) {
                    outputJsonSchema = zodToJsonSchema(outputZodSchema);
                }

                const argNames = (operation.parameters || []).map(p => p.name);
                if (operation.requestBody?.content?.['application/json']?.schema?.properties) {
                    argNames.push(...Object.keys(operation.requestBody.content['application/json'].schema.properties));
                }

                const tool = {
                    name: toolName,
                    title: operation.summary || toolName,
                    description: operation.description || operation.summary,
                    zodSchema: inputZodSchema,
                    argNames: argNames,
                    handler: serviceMapping[toolName]
                };
                toolMapping[toolName] = tool;

                allToolsForListing.push({
                    name: tool.name,
                    title: tool.title,
                    description: tool.description,
                    inputSchema: inputJsonSchema,
                    outputSchema: outputJsonSchema,
                    annotations: operation['x-annotations'] || null
                });
            }
        }
    }
}

function listTools({ cursor = 0, limit } = {}) {
    initializeToolMapping();

    if (!limit) {
        return {
            tools: allToolsForListing,
            nextCursor: null
        };
    }
    
    const start = cursor;
    const end = start + limit;
    const toolsSlice = allToolsForListing.slice(start, end);

    const nextCursor = end < allToolsForListing.length ? end : null;

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

    const validatedArgs = tool.zodSchema.parse(args);

    if (toolName === 'list_pull_requests') {
        return tool.handler(validatedArgs);
    }

    const handlerArgs = tool.argNames.map(name => validatedArgs[name]);
    return tool.handler(...handlerArgs);
}

export {
    listTools,
    callTool
};