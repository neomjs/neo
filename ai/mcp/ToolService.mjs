import fs                                                 from 'fs';
import * as yaml from 'js-yaml';
import {buildZodSchema,
        buildOutputZodSchema,
        resolveRef,
        toOpenApiJsonSchema}                              from './validation/openApiValidator.mjs';
import Base                                               from '../../src/core/Base.mjs';

/**
 * Shared service for managing, listing, calling, and validating MCP tools.
 * Can be instantiated by both MCP Servers (with OpenAPI spec) and MCP Clients.
 *
 * @class Neo.ai.mcp.ToolService_tmp
 * @extends Neo.core.Base
 */
class ToolService_tmp extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.ToolService'
         * @protected
         */
        className: 'Neo.ai.mcp.ToolService',
        /**
         * Path to the OpenAPI specification file.
         * @member {String|null} openApiFilePath=null
         */
        openApiFilePath: null,
        /**
         * Enables compact `tools/list` descriptions while preserving full
         * detail for `getToolHandbook()`.
         * @member {Boolean} compactToolDescriptions=false
         */
        compactToolDescriptions: false,
        /**
         * Maximum description length emitted through compact `tools/list`.
         * @member {Number} toolListDescriptionMaxLength=160
         */
        toolListDescriptionMaxLength: 160
    }

    /**
     * Internal cache for tools formatted for the MCP 'tools/list' response.
     * @member {Array|null} allToolsForListing=null
     * @protected
     */
    allToolsForListing = null
    /**
     * OpenAPI-root projection policy for harness-embedded tool surfaces.
     * @member {Object|null} harnessToolProjection=null
     * @protected
     */
    harnessToolProjection = null
    /**
     * Map of service method handlers.
     * Only getting set for MCP servers.
     * @member {Object|null} serviceMapping=null
     */
    serviceMapping = null
    /**
     * Tool projection tier by operationId. Populated from `x-neo-tool-tier`.
     * @member {Object|null} toolProjectionTiers=null
     * @protected
     */
    toolProjectionTiers = null
    /**
     * Internal cache for parsed tool definitions.
     * @member {Object|null} toolMapping=null
     * @protected
     */
    toolMapping = null
    /**
     * Internal cache for lazy-loaded tool handbook entries.
     * @member {Object|null} toolHandbookMapping=null
     * @protected
     */
    toolHandbookMapping = null

    /**
     * Executes a specific tool with the given arguments.
     * @param {String} toolName
     * @param {Object} args
     * @returns {Promise<any>}
     */
    async callTool(toolName, args, options={}) {
        this.initializeToolMapping();

        const effectiveToolName = this.resolveEffectiveToolName(toolName);

        const tool = this.toolMapping[effectiveToolName];

        if (!tool || !tool.handler) {
            throw new Error(`Tool "${effectiveToolName}" not found or not implemented.`);
        }

        this.assertToolProjectionAllows(effectiveToolName, options.toolProjection);

        const validatedArgs = tool.zodSchema.parse(args);

        if (tool.passAsObject) {
            return tool.handler(validatedArgs);
        }

        const handlerArgs = tool.argNames.map(name => validatedArgs[name]);
        return tool.handler(...handlerArgs);
    }

    /**
     * Initializes the internal tool mapping and the list of tools.
     * Designed to be called lazily.
     */
    initializeToolMapping() {
        const me = this;

        if (me.toolMapping) {
            return;
        }

        // Client-side usage without OpenAPI spec: skip initialization
        if (!me.openApiFilePath) {
            me.toolMapping        = {};
            me.allToolsForListing = [];
            return;
        }

        me.toolMapping         = {};
        me.allToolsForListing  = [];
        me.toolHandbookMapping = {};
        me.toolProjectionTiers = {};

        const openApiDocument = yaml.load(fs.readFileSync(me.openApiFilePath, 'utf8'));
        me.harnessToolProjection = openApiDocument['x-neo-harness-tool-projection'] || null;

        for (const pathItem of Object.values(openApiDocument.paths)) {
            for (const operation of Object.values(pathItem)) {
                if (operation.operationId) {
                    const toolName = operation.operationId;
                    const toolTier = operation['x-neo-tool-tier'] || null;

                    const inputZodSchema  = buildZodSchema(openApiDocument, operation);
                    const inputJsonSchema = toOpenApiJsonSchema(inputZodSchema);

                    const outputZodSchema = buildOutputZodSchema(openApiDocument, operation);
                    let outputJsonSchema  = null;
                    if (outputZodSchema) {
                        outputJsonSchema = toOpenApiJsonSchema(outputZodSchema);
                    }

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

                    const fullDescription = operation.description || operation.summary || toolName;
                    const listDescription = me.compactToolDescriptions
                        ? me.buildToolListDescription(operation, fullDescription)
                        : fullDescription;

                    const tool = {
                        name        : toolName,
                        title       : operation.summary || toolName,
                        description : listDescription,
                        zodSchema   : inputZodSchema,
                        toolTier,
                        argNames,
                        handler     : me.serviceMapping ? me.serviceMapping[toolName] : null,
                        passAsObject: operation['x-pass-as-object'] === true
                    };
                    me.toolMapping[toolName] = tool;
                    me.toolProjectionTiers[toolName] = toolTier;
                    me.toolHandbookMapping[toolName] = me.buildToolHandbookEntry(toolName, operation, fullDescription);

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
                    me.allToolsForListing.push(toolForListing);
                }
            }
        }
    }

    /**
     * @summary Builds the compact description emitted through `tools/list`.
     * @param {Object} operation       Parsed OpenAPI operation.
     * @param {String} fullDescription Full operation description fallback.
     * @returns {String}
     * @protected
     */
    buildToolListDescription(operation, fullDescription) {
        const
            source = operation['x-neo-tool-summary'] || operation.summary || fullDescription || '',
            singleLine = String(source).replace(/\s+/g, ' ').trim(),
            maxLength  = this.toolListDescriptionMaxLength;

        if (!maxLength || singleLine.length <= maxLength) {
            return singleLine;
        }

        return `${singleLine.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
    }

    /**
     * @summary Builds one lazy-loaded handbook entry from OpenAPI metadata.
     * @param {String} toolName        The operation id.
     * @param {Object} operation       Parsed OpenAPI operation.
     * @param {String} fullDescription Full operation description fallback.
     * @returns {Object}
     * @protected
     */
    buildToolHandbookEntry(toolName, operation, fullDescription) {
        const
            dedicated = operation['x-neo-tool-handbook'],
            handbook  = dedicated || fullDescription || operation.summary || toolName;

        return {
            toolId     : toolName,
            found      : true,
            title      : operation.summary || toolName,
            description: operation.description || operation.summary || '',
            handbook,
            source     : dedicated ? 'x-neo-tool-handbook' : (operation.description ? 'description' : 'summary')
        };
    }

    /**
     * @summary Returns the lazy-loaded handbook entry for one tool id/name.
     * @param {String} toolId The OpenAPI operation id or namespaced MCP tool id.
     * @returns {Object}
     */
    getToolHandbook(toolId) {
        this.initializeToolMapping();

        const
            requestedToolId = String(toolId || ''),
            effectiveToolId = this.resolveEffectiveToolName(requestedToolId),
            entry           = this.toolHandbookMapping[effectiveToolId];

        if (!entry) {
            return {
                toolId: requestedToolId,
                found : false,
                code  : 'TOOL_NOT_FOUND',
                message: `Tool "${requestedToolId}" does not exist in this MCP server.`
            };
        }

        return entry;
    }

    /**
     * Provides a paginated list of available tools.
     * @param {Object} [options]
     * @param {Number} [options.cursor=0]
     * @param {Number} [options.limit]
     * @returns {Object}
     */
    listTools({cursor=0, limit, toolProjection} = {}) {
        const me = this;

        me.initializeToolMapping();
        const toolsForListing = me.getToolsForProjection(toolProjection);

        if (!limit) {
            return {
                tools     : toolsForListing,
                nextCursor: undefined
            };
        }

        const start      = cursor;
        const end        = start + limit;
        const toolsSlice = toolsForListing.slice(start, end);
        const nextCursor = end < toolsForListing.length ? String(end) : undefined;

        return {
            tools: toolsSlice,
            nextCursor
        };
    }

    /**
     * @summary Returns the server-declared harness projection policy.
     * @returns {Object|null}
     */
    getToolProjectionPolicy() {
        this.initializeToolMapping();
        return this.harnessToolProjection;
    }

    /**
     * @summary Returns tools visible through an explicit projection context.
     * No context means the existing developer/operator surface stays full.
     * @param {Object|String|null} toolProjection
     * @returns {Array<Object>}
     */
    getToolsForProjection(toolProjection) {
        const me      = this,
              context = me.normalizeToolProjectionContext(toolProjection);

        if (!context) {
            return me.allToolsForListing;
        }

        return me.allToolsForListing.filter(tool => me.isToolAllowedForProjection(tool.name, context));
    }

    /**
     * @summary Throws when a tool is not visible through the supplied projection context.
     * @param {String}             toolName
     * @param {Object|String|null} toolProjection
     */
    assertToolProjectionAllows(toolName, toolProjection) {
        const me      = this,
              context = me.normalizeToolProjectionContext(toolProjection);

        if (!context || me.isToolAllowedForProjection(toolName, context)) {
            return;
        }

        const error = new Error(`Tool "${toolName}" is not visible in the ${context.mode || 'unknown'} projection.`);
        error.code   = 'POLICY_REFUSED';
        error.reason = error.message;
        throw error;
    }

    /**
     * @summary Normalizes the projection context passed by a server boundary.
     * @param {Object|String|null} toolProjection
     * @returns {Object|null}
     * @protected
     */
    normalizeToolProjectionContext(toolProjection) {
        if (!toolProjection) {
            return null;
        }

        if (Neo.isString(toolProjection)) {
            return {mode: toolProjection};
        }

        return toolProjection;
    }

    /**
     * @summary Applies the OpenAPI-root harness projection policy to one tool.
     * Unknown projection modes and missing tiers fail closed.
     * @param {String} toolName
     * @param {Object} context
     * @returns {Boolean}
     * @protected
     */
    isToolAllowedForProjection(toolName, context) {
        const me = this;

        if (context.mode !== 'harness-embedded') {
            return false;
        }

        const visibleTiers = me.harnessToolProjection?.defaultVisibleTiers || [],
              toolTier     = me.toolProjectionTiers?.[toolName];

        return Boolean(toolTier && visibleTiers.includes(toolTier));
    }

    /**
     * Validates a value against a JSON Schema subset.
     * @param {*}      value
     * @param {Object} schema
     * @param {String} [path='args']
     * @returns {Boolean}
     */
    validateJsonSchema(value, schema, path='args') {
        if (!schema) return true;

        if (schema.type) {
            const type = schema.type;
            const valueType = Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value);

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

        if (schema.type === 'object') {
            if (schema.required) {
                schema.required.forEach(field => {
                    if (value[field] === undefined) {
                        throw new Error(`Validation Error at ${path}: Missing required property '${field}'`);
                    }
                });
            }
            if (schema.properties) {
                Object.keys(value).forEach(key => {
                    if (schema.properties[key]) {
                        this.validateJsonSchema(value[key], schema.properties[key], `${path}.${key}`);
                    }
                });
            }
        }

        if (schema.type === 'array' && schema.items) {
            value.forEach((item, index) => {
                this.validateJsonSchema(item, schema.items, `${path}[${index}]`);
            });
        }

        if (schema.enum) {
            if (!schema.enum.includes(value)) {
                throw new Error(`Validation Error at ${path}: Value '${value}' is not allowed. Allowed values: ${schema.enum.join(', ')}`);
            }
        }

        return true;
    }

    /**
     * Validates tool input against the internal Zod schema (if available) or a provided JSON Schema.
     * @param {String} toolName
     * @param {Object} args
     * @param {Object} [schema]
     * @returns {boolean}
     */
    validateToolInput(toolName, args, schema) {
        const me = this;

        me.initializeToolMapping();

        // 1. Try Server-side validation using internal Zod schemas
        if (me.toolMapping) {
            const effectiveToolName = this.resolveEffectiveToolName(toolName);

            const tool = me.toolMapping[effectiveToolName];
            if (tool) {
                tool.zodSchema.parse(args);
                return true;
            }
        }

        // 2. Fallback: Client-side validation using provided JSON Schema
        if (schema) {
            return me.validateJsonSchema(args, schema);
        }

        return true;
    }

    /**
     * @summary Resolves namespaced MCP tool ids back to OpenAPI operation ids.
     * @param {String} toolName
     * @returns {String}
     * @protected
     */
    resolveEffectiveToolName(toolName) {
        const lastDoubleUnderscoreIndex = toolName.lastIndexOf('__');

        return lastDoubleUnderscoreIndex !== -1
            ? toolName.substring(lastDoubleUnderscoreIndex + 2)
            : toolName;
    }
}

export default Neo.setupClass(ToolService_tmp);
