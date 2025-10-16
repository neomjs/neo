import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fileURLToPath } from 'url';
import * as healthService from './healthService.mjs';
import * as databaseService from './databaseService.mjs';
import * as queryService from './queryService.mjs';
import * as documentService from './documentService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

// Internal cache for parsed tool definitions to avoid re-parsing OpenAPI on every call.
let toolMapping = null;
// Internal cache for tools formatted for the MCP 'tools/list' response, including JSON schemas.
let allToolsForListing = null;

/**
 * Maps snake_case tool names (from OpenAPI operationId) to their corresponding
 * service handler functions. This explicit mapping ensures clarity and allows
 * for easy lookup of the correct function to execute a tool.
 */
const serviceMapping = {
    healthcheck          : healthService.healthcheck,
    sync_database        : databaseService.syncDatabase,
    create_knowledge_base: databaseService.createKnowledgeBase,
    embed_knowledge_base : databaseService.embedKnowledgeBase,
    delete_database      : databaseService.deleteDatabase,
    query_documents      : queryService.queryDocuments,
    list_documents       : documentService.listDocuments,
    get_document_by_id   : documentService.getDocumentById
};

/**
 * Dynamically constructs a Zod schema for a tool's input arguments based on its
 * OpenAPI operation definition. This schema is used for robust runtime validation
 * of incoming tool call arguments.
 * @param {object} openApiDocument - The OpenAPI document object.
 * @param {object} operation       - The OpenAPI operation object.
 * @returns {z.ZodObject} A Zod object schema representing the tool's input.
 */
function buildZodSchema(openApiDocument, operation) {
    const shape = {};

    // Process parameters defined in the OpenAPI operation (path, query, header, etc.).
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
                    // Fallback for unsupported or unknown schema types.
                    schema = z.any();
            }
            // Mark schema as optional if not explicitly required.
            if (!param.required) {
                schema = schema.optional();
            }
            // Add description for better Zod schema introspection.
            shape[param.name] = schema.describe(param.description);
        }
    }

    // Process request body properties, typically for POST/PUT operations.
    if (operation.requestBody?.content?.['application/json']?.schema) {
        let requestBodySchema = operation.requestBody.content['application/json'].schema;
        if (requestBodySchema.$ref) {
            requestBodySchema = resolveRef(openApiDocument, requestBodySchema.$ref);
        }

        if (requestBodySchema.properties) {
            const { properties, required = [] } = requestBodySchema;
            for (const [propName, propSchema] of Object.entries(properties)) {
                let schema;
                switch (propSchema.type) {
                    case 'string':
                        schema = z.string();
                        break;
                    case 'array':
                        schema = z.array(z.string());
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
    }
    return z.object(shape);
}

/**
 * Recursively resolves JSON references ($ref) within the OpenAPI document.
 * This is crucial for building complete Zod schemas from potentially fragmented
 * OpenAPI definitions (e.g., schemas defined in 'components').
 * @param {object} doc - The full OpenAPI document.
 * @param {string} ref - The JSON reference string (e.g., '#/components/schemas/MySchema').
 * @returns {object} The resolved schema object.
 */
function resolveRef(doc, ref) {
    // Remove '#/' prefix and split the path into components.
    const parts = ref.substring(2).split('/');
    // Traverse the document object to find the referenced schema.
    return parts.reduce((acc, part) => acc[part], doc);
}

/**
 * Recursively builds a Zod schema from an OpenAPI schema object, handling
 * nested structures and JSON references. This is used for output schemas.
 * @param {object} doc - The full OpenAPI document for reference resolution.
 * @param {object} schema - The OpenAPI schema object (or a resolved reference).
 * @returns {z.ZodType} A Zod schema representing the OpenAPI schema.
 */
function buildZodSchemaFromResponse(doc, schema) {
    if (schema.$ref) {
        return buildZodSchemaFromResponse(doc, resolveRef(doc, schema.$ref));
    }

    let zodSchema;
    if (schema.type === 'object') {
        const shape = {};
        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                shape[propName] = buildZodSchemaFromResponse(doc, propSchema);
            }
        }
        zodSchema = z.object(shape);
    } else if (schema.type === 'array') {
        zodSchema = z.array(buildZodSchemaFromResponse(doc, schema.items));
    } else if (schema.type === 'string') {
        zodSchema = z.string();
    } else if (schema.type === 'integer') {
        zodSchema = z.number().int();
    } else if (schema.type === 'boolean') {
        zodSchema = z.boolean();
    } else {
        zodSchema = z.any();
    }

    if (schema.description) {
        zodSchema = zodSchema.describe(schema.description);
    }

    return zodSchema;
}

/**
 * Constructs a Zod schema for a tool's output based on its OpenAPI operation's
 * successful response (200, 201, or 202). This schema is used to describe the expected
 * output structure to clients.
 * @param {object} doc - The full OpenAPI document for reference resolution.
 * @param {object} operation - The OpenAPI operation object.
 * @returns {z.ZodType|null} A Zod schema for the output, or null if no schema is defined.
 */
function buildOutputZodSchema(doc, operation) {
    const response = operation.responses?.['200'] || operation.responses?.['201'] || operation.responses?.['202'];
    const schema = response?.content?.['application/json']?.schema;

    if (schema) {
        return buildZodSchemaFromResponse(doc, schema);
    }

    if (response?.content?.['text/plain']) {
        // For text/plain, we need to wrap it in an object for client compatibility
        return z.object({ result: z.string().describe(response.description || '') }).required();
    }

    // If no schema is found, return null to indicate its absence.
    return null;
}

/**
 * Initializes the internal tool mapping and the list of tools for client discovery.
 * This function is designed to be called lazily on the first request to avoid
 * unnecessary parsing at startup.
 */
function initializeToolMapping() {
    // Prevent re-initialization if already done.
    if (toolMapping) {
        return;
    }

    toolMapping        = {};
    allToolsForListing = [];

    // Load and parse the OpenAPI specification.
    const openApiDocument = yaml.load(fs.readFileSync(openApiFilePath, 'utf8'));

    // Iterate through all paths and operations defined in the OpenAPI document.
    for (const pathItem of Object.values(openApiDocument.paths)) {
        for (const operation of Object.values(pathItem)) {
            // Only process operations that have an operationId, as these are considered tools.
            if (operation.operationId) {
                const toolName = operation.operationId;

                // Build Zod schema for input arguments and convert to JSON Schema for client discovery.
                const inputZodSchema = buildZodSchema(openApiDocument, operation);
                const inputJsonSchema = zodToJsonSchema(inputZodSchema, {
                    target: 'openApi3',
                    $refStrategy: 'none' // Inline all definitions
                });

                // Build Zod schema for output and convert to JSON Schema for client discovery.
                const outputZodSchema = buildOutputZodSchema(openApiDocument, operation);
                let outputJsonSchema = null;
                if (outputZodSchema) {
                    outputJsonSchema = zodToJsonSchema(outputZodSchema);
                }

                // Extract argument names in order for positional argument mapping to service handlers.
                const argNames = (operation.parameters || []).map(p => p.name);
                if (operation.requestBody?.content?.['application/json']?.schema) {
                     const requestBodySchema = operation.requestBody.content['application/json'].schema;
                     if (requestBodySchema.$ref) {
                         const resolvedSchema = resolveRef(openApiDocument, requestBodySchema.$ref);
                         argNames.push(...Object.keys(resolvedSchema.properties));
                     } else if (requestBodySchema.properties) {
                         argNames.push(...Object.keys(requestBodySchema.properties));
                     }
                }


                // Store the internal tool definition for execution.
                const tool = {
                    name       : toolName,
                    title      : operation.summary || toolName,
                    description: operation.description || operation.summary,
                    zodSchema  : inputZodSchema,
                    argNames,
                    handler    : serviceMapping[toolName]
                };
                toolMapping[toolName] = tool;

                // Store the client-facing tool definition for 'tools/list' response.
                const toolForListing = {
                    name        : tool.name,
                    title       : tool.title,
                    description : tool.description,
                    inputSchema : inputJsonSchema
                };
                if (outputJsonSchema !== null) {
                    toolForListing.outputSchema = outputJsonSchema;
                }
                if (operation['x-annotations'] !== null) {
                    toolForListing.annotations = operation['x-annotations'];
                }
                allToolsForListing.push(toolForListing);
            }
        }
    }
}

/**
 * Provides a paginated list of available tools, formatted for MCP client discovery.
 * @param {object} [options] - Pagination options.
 * @param {number} [options.cursor=0] - The starting index for the list.
 * @param {number} [options.limit] - The maximum number of tools to return. If not provided, all tools are returned.
 * @returns {object} An object containing the list of tools and a nextCursor for pagination.
 */
function listTools({ cursor = 0, limit } = {}) {
    initializeToolMapping();

    // If no limit is specified, return all tools without pagination.
    if (!limit) {
        return {
            tools     : allToolsForListing,
            nextCursor: null
        };
    }

    // Apply pagination based on cursor and limit.
    const start      = cursor;
    const end        = start + limit;
    const toolsSlice = allToolsForListing.slice(start, end);
    const nextCursor = end < allToolsForListing.length ? String(end) : null; // Specs do not accept numbers

    return {
        tools: toolsSlice,
        nextCursor
    };
}

/**
 * Executes a specific tool with the given arguments.
 * This function performs input validation and maps arguments to the service handler.
 * @param {string} toolName - The name of the tool to call (snake_case).
 * @param {object} args - The arguments provided by the client for the tool call.
 * @returns {Promise<any>} The result of the tool execution.
 * @throws {Error} If the tool is not found, not implemented, or arguments are invalid.
 */
async function callTool(toolName, args) {
    initializeToolMapping();
    const tool = toolMapping[toolName];

    // Ensure the tool exists and has a registered handler.
    if (!tool || !tool.handler) {
        throw new Error(`Tool "${toolName}" not found or not implemented.`);
    }

    // Validate incoming arguments against the tool's Zod schema.
    // This will throw an error if validation fails, which is caught by the MCP server.
    const validatedArgs = tool.zodSchema.parse(args);

    // Special handling for tools that expect a single object argument.
    if (['query_documents', 'list_documents', 'get_document_by_id'].includes(toolName)) {
        return tool.handler(validatedArgs);
    }

    // For other tools, map validated arguments to positional arguments for the handler.
    const handlerArgs = tool.argNames.map(name => validatedArgs[name]);
    return tool.handler(...handlerArgs);
}

export {
    listTools,
    callTool
};
