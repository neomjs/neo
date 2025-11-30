import fs                                                 from 'fs';
import yaml                                               from 'js-yaml';
import {zodToJsonSchema}                                  from 'zod-to-json-schema';
import {buildZodSchema, buildOutputZodSchema, resolveRef} from './validation/OpenApiValidator.mjs';

let toolMapping        = null; // Internal cache for parsed tool definitions to avoid re-parsing OpenAPI on every call.
let allToolsForListing = null; // Internal cache for tools formatted for the MCP 'tools/list' response, including JSON schemas.

let serviceMapping, openApiFilePath;

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
                    name        : toolName,
                    title       : operation.summary || toolName,
                    description : operation.description || operation.summary,
                    zodSchema   : inputZodSchema,
                    argNames,
                    handler     : serviceMapping[toolName],
                    passAsObject: operation['x-pass-as-object'] === true
                };
                toolMapping[toolName] = tool;

                // Store the client-facing tool definition for 'tools/list' response.
                const toolForListing = {
                    name       : tool.name,
                    title      : tool.title,
                    description: tool.description,
                    inputSchema: inputJsonSchema
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

    // Handle server-prefixed tool names (e.g., "neo-knowledge-base__healthcheck")
    const lastDoubleUnderscoreIndex = toolName.lastIndexOf('__');
    const effectiveToolName = lastDoubleUnderscoreIndex !== -1
        ? toolName.substring(lastDoubleUnderscoreIndex + 2)
        : toolName;

    const tool = toolMapping[effectiveToolName];

    // Ensure the tool exists and has a registered handler.
    if (!tool || !tool.handler) {
        throw new Error(`Tool "${effectiveToolName}" not found or not implemented.`);
    }

    // Validate incoming arguments against the tool's Zod schema.
    // This will throw an error if validation fails, which is caught by the MCP server.
    const validatedArgs = tool.zodSchema.parse(args);

    // Use the passAsObject flag to determine how to call the handler.
    if (tool.passAsObject) {
        return tool.handler(validatedArgs);
    }

    // For other tools, map validated arguments to positional arguments for the handler.
    const handlerArgs = tool.argNames.map(name => validatedArgs[name]);
    return tool.handler(...handlerArgs);
}

/**
 * Validates tool input against the internal Zod schema (if available) or a provided JSON Schema.
 *
 * @param {string} toolName - The name of the tool.
 * @param {object} args - The arguments to validate.
 * @param {object} [schema] - Optional JSON schema to validate against (fallback for External Servers).
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails or tool is not found.
 */
function validateToolInput(toolName, args, schema) {
    // 1. Try Server-side validation using internal Zod schemas (best quality)
    if (toolMapping) {
        const lastDoubleUnderscoreIndex = toolName.lastIndexOf('__');
        const effectiveToolName = lastDoubleUnderscoreIndex !== -1
            ? toolName.substring(lastDoubleUnderscoreIndex + 2)
            : toolName;

        const tool = toolMapping[effectiveToolName];
        if (tool) {
            tool.zodSchema.parse(args); // Throws if invalid
            return true;
        }
    }

    // 2. Fallback: Client-side validation using provided JSON Schema (for External Servers)
    if (schema) {
        return validateJsonSchema(args, schema);
    }

    // 3. If neither is available, we can't validate.
    // For now, we assume valid if no schema is present to avoid blocking valid calls.
    return true;
}

/**
 * Validates a value against a JSON Schema subset (Draft 7).
 * Supports: type (string, number, integer, boolean, object, array), required, properties, items, enum.
 * Copied from Client.mjs for shared use.
 * @param {*} value
 * @param {Object} schema
 * @param {String} [path='args']
 * @returns {Boolean} true if valid
 * @throws {Error} if invalid
 */
function validateJsonSchema(value, schema, path = 'args') {
    if (!schema) return true;

    // Handle types
    if (schema.type) {
        const type = schema.type;
        const valueType = Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value);

        // JSON Schema 'integer' check
        if (type === 'integer') {
            if (typeof value !== 'number' || !Number.isInteger(value)) {
                throw new Error(`Validation Error at ${path}: Expected integer, got ${valueType} (${value})`);
            }
        } else if (type === 'number') {
            if (typeof value !== 'number') {
                throw new Error(`Validation Error at ${path}: Expected number, got ${valueType}`);
            }
        } else if (type === 'string') {
            if (typeof value !== 'string') {
                throw new Error(`Validation Error at ${path}: Expected string, got ${valueType}`);
            }
        } else if (type === 'boolean') {
            if (typeof value !== 'boolean') {
                throw new Error(`Validation Error at ${path}: Expected boolean, got ${valueType}`);
            }
        } else if (type === 'object') {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error(`Validation Error at ${path}: Expected object, got ${valueType}`);
            }
        } else if (type === 'array') {
            if (!Array.isArray(value)) {
                throw new Error(`Validation Error at ${path}: Expected array, got ${valueType}`);
            }
        }
    }

    // Handle Objects
    if (schema.type === 'object') {
        // Required fields
        if (schema.required) {
            schema.required.forEach(field => {
                if (value[field] === undefined) {
                    throw new Error(`Validation Error at ${path}: Missing required property '${field}'`);
                }
            });
        }

        // Properties
        if (schema.properties) {
            Object.keys(value).forEach(key => {
                if (schema.properties[key]) {
                    validateJsonSchema(value[key], schema.properties[key], `${path}.${key}`);
                }
            });
        }
    }

    // Handle Arrays
    if (schema.type === 'array' && schema.items) {
        value.forEach((item, index) => {
            validateJsonSchema(item, schema.items, `${path}[${index}]`);
        });
    }

    // Handle Enum
    if (schema.enum) {
        if (!schema.enum.includes(value)) {
            throw new Error(`Validation Error at ${path}: Value '${value}' is not allowed. Allowed values: ${schema.enum.join(', ')}`);
        }
    }

    return true;
}

function initialize(mapping, filePath) {
    serviceMapping  = mapping;
    openApiFilePath = filePath;
}

export {
    initialize,
    listTools,
    callTool,
    validateToolInput
};
