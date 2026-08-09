import crypto    from 'node:crypto';
import fs        from 'fs';
import * as yaml from 'js-yaml';
import {buildZodSchema,
        buildOutputZodSchema,
        resolveRef,
        toOpenApiJsonSchema}                              from './validation/openApiValidator.mjs';
import Base                                               from '../../src/core/Base.mjs';

/**
 * Label prefixing the advertised-surface digest inside the carrier tool's description.
 *
 * Exported because it is the anchor the documented comparison procedure tells a reader to look for,
 * and the same literal the result side reports back. A second copy of this string anywhere would let
 * the two halves drift apart while both still look correct.
 * @type {String}
 */
export const ADVERTISED_SURFACE_DIGEST_LABEL = 'Advertised-surface digest at attach:';

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
         * Strips `description` prose from the schemas emitted through `tools/list`, recursively,
         * while preserving every shape-bearing key — `description` is a JSON Schema annotation and
         * is never asserted, so the projected schema validates the identical accept/reject set.
         * The fully-described schema relocates into `getToolHandbook()` — relocated, not deleted.
         * Sibling of `compactToolDescriptions`: same default-off, same per-server opt-in.
         * @member {Boolean} compactToolSchemas=false
         */
        compactToolSchemas: false,
        /**
         * Maximum description length emitted through compact `tools/list`.
         * @member {Number} toolListDescriptionMaxLength=160
         */
        toolListDescriptionMaxLength: 160,
        /**
         * Tool whose DESCRIPTION carries the advertised-surface digest a client caches at attach.
         *
         * `healthcheck` is the carrier because it is the one tool every server exposes and the one
         * an unhealthy server still answers — a seat holding a stale surface can always reach it.
         * @member {String} surfaceDigestCarrierTool='healthcheck'
         */
        surfaceDigestCarrierTool: 'healthcheck'
    }

    /**
     * Internal cache for tools formatted for the MCP 'tools/list' response.
     * @member {Array|null} allToolsForListing=null
     * @protected
     */
    allToolsForListing = null
    /**
     * Valid exact tool profiles compiled from the OpenAPI-root
     * `x-neo-exact-tool-profiles` declaration.
     * @member {Object|null} exactToolProfiles=null
     * @protected
     */
    exactToolProfiles = null
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
     * @summary Executes a specific tool with the given arguments.
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

        this.assertToolProjectionAllows(effectiveToolName, options.toolProjection, toolName);

        const projectionSchema = this.getProjectionInputZodSchema(effectiveToolName, options.toolProjection),
              validatedArgs    = (projectionSchema || tool.zodSchema).parse(args);

        if (tool.passAsObject) {
            return tool.handler(validatedArgs);
        }

        const handlerArgs = tool.argNames.map(name => validatedArgs[name]);
        return tool.handler(...handlerArgs);
    }

    /**
     * @summary Initializes the internal tool mapping and the list of tools.
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
        me.exactToolProfiles   = {};

        const openApiDocument = yaml.load(fs.readFileSync(me.openApiFilePath, 'utf8'));
        me.harnessToolProjection = openApiDocument['x-neo-harness-tool-projection'] || null;

        for (const pathItem of Object.values(openApiDocument.paths)) {
            for (const operation of Object.values(pathItem)) {
                if (operation.operationId) {
                    const toolName = operation.operationId;
                    const toolTier = operation['x-neo-tool-tier'] || null;

                    const inputZodSchema  = buildZodSchema(openApiDocument, operation);
                    const inputJsonSchema = toOpenApiJsonSchema(inputZodSchema);

                    const outputZodSchema  = buildOutputZodSchema(openApiDocument, operation);
                    let   outputJsonSchema = null;
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
                    // The prose/schema split: the listing carries shape only when compaction is on,
                    // and the handbook is where the fully-described schema lives — the same lazy
                    // surface the compacted operation description already defers to. The described
                    // originals are never mutated; the listing gets fresh projected objects.
                    me.toolHandbookMapping[toolName] = me.buildToolHandbookEntry(toolName, operation, fullDescription,
                        me.compactToolSchemas
                            ? {inputSchema: inputJsonSchema, outputSchema: outputJsonSchema}
                            : null
                    );

                    const listedInputSchema = me.compactToolSchemas
                        ? me.stripSchemaDescriptions(inputJsonSchema)
                        : inputJsonSchema;

                    let listedOutputSchema = outputJsonSchema;
                    if (me.compactToolSchemas && outputJsonSchema !== null) {
                        listedOutputSchema = me.stripSchemaDescriptions(outputJsonSchema)
                    }

                    const toolForListing = {
                        name       : tool.name,
                        title      : tool.title,
                        description: tool.description,
                        inputSchema: listedInputSchema
                    };
                    if (listedOutputSchema !== null) {
                        toolForListing.outputSchema = listedOutputSchema;
                    }
                    if (operation['x-annotations'] !== null) {
                        toolForListing.annotations = operation['x-annotations'];
                    }
                    me.allToolsForListing.push(toolForListing);
                }
            }
        }

        me.exactToolProfiles = me.buildExactToolProfiles(openApiDocument);
    }

    /**
     * @summary Compiles valid OpenAPI-root exact profiles into list/call policy data.
     *
     * A malformed profile is omitted as one atomic unit, making every request for
     * that profile fail closed. Operation ids and constrained input schemas remain
     * owned by the OpenAPI declaration; this service stores only their compiled form.
     *
     * @param {Object} openApiDocument Parsed OpenAPI document.
     * @returns {Object} Valid exact profiles keyed by server projection mode.
     * @protected
     */
    buildExactToolProfiles(openApiDocument) {
        const
            me           = this,
            root         = openApiDocument['x-neo-exact-tool-profiles'],
            declarations = root?.profiles,
            profiles     = {},
            isRecord     = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

        if (!isRecord(root) || !isRecord(declarations)) {
            return profiles;
        }

        for (const [profileName, declaration] of Object.entries(declarations)) {
            const toolDeclarations = declaration?.tools;

            if (
                !profileName ||
                profileName === 'harness-embedded' ||
                profileName.trim() !== profileName ||
                !isRecord(declaration) ||
                !isRecord(toolDeclarations) ||
                Object.keys(toolDeclarations).length === 0
            ) {
                continue;
            }

            const tools   = {};
            let   isValid = true;

            for (const [toolName, toolDeclaration] of Object.entries(toolDeclarations)) {
                if (!Object.hasOwn(me.toolMapping, toolName) || !isRecord(toolDeclaration)) {
                    isValid = false;
                    break;
                }

                let inputJsonSchema = null,
                    inputZodSchema  = null;

                if (Object.hasOwn(toolDeclaration, 'inputSchema')) {
                    const inputSchema = toolDeclaration.inputSchema;

                    if (!isRecord(inputSchema)) {
                        isValid = false;
                        break;
                    }

                    try {
                        const resolvedInputSchema = inputSchema.$ref
                            ? resolveRef(openApiDocument, inputSchema.$ref)
                            : inputSchema;

                        if (!isRecord(resolvedInputSchema) || resolvedInputSchema.type !== 'object') {
                            isValid = false;
                            break;
                        }

                        inputZodSchema = buildZodSchema(openApiDocument, {
                            requestBody: {
                                content: {
                                    'application/json': {schema: inputSchema}
                                }
                            }
                        });
                        inputJsonSchema = toOpenApiJsonSchema(inputZodSchema);
                    } catch {
                        isValid = false;
                        break;
                    }
                }

                tools[toolName] = {inputJsonSchema, inputZodSchema};
            }

            if (isValid) {
                profiles[profileName] = {
                    description: declaration.description || '',
                    tools
                };
            }
        }

        return profiles;
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
            source     = operation['x-neo-tool-summary'] || operation.summary || fullDescription || '',
            singleLine = String(source).replace(/\s+/g, ' ').trim(),
            maxLength  = this.toolListDescriptionMaxLength;

        if (!maxLength || singleLine.length <= maxLength) {
            return singleLine;
        }

        return `${singleLine.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
    }

    /**
     * @summary Projects a JSON Schema for `tools/list` by removing every annotation-position
     * `description` — position-aware, never key-name-blind.
     *
     * `description` is an annotation ONLY where a schema object carries it. The walker descends
     * exclusively into schema-valued positions — the `properties` / `$defs` / `patternProperties` /
     * `dependentSchemas` maps, the `items` / `contains` / `additionalProperties` / `not` / `if` /
     * `then` / `else` subschemas, and the `oneOf` / `anyOf` / `allOf` / `prefixItems` arrays —
     * and copies everything else verbatim. Three failure modes are excluded by construction:
     *
     * - an APPLICATION property named `description` (a key under `properties`) is data, not an
     *   annotation: the property declaration survives; only its own annotation is stripped;
     * - object-valued assertion data (`enum`, `const`, `default`, `examples`) is never descended
     *   into, so a `description` key inside a default value survives untouched;
     * - a keyword the walker does not know is copied rather than recursed, so the next schema
     *   feature the contract adopts cannot be silently mangled — at worst its prose stays.
     *
     * Returns fresh objects — the described input is never mutated, because the handbook surface
     * keeps it (the prose is relocated, not deleted).
     * @param {*} schema
     * @returns {*}
     * @protected
     */
    stripSchemaDescriptions(schema) {
        if (!schema || typeof schema !== 'object') {
            return schema
        }

        if (Array.isArray(schema)) {
            return schema.map(item => this.stripSchemaDescriptions(item))
        }

        const
            SCHEMA_MAP_KEYS   = new Set(['properties', '$defs', 'patternProperties', 'dependentSchemas']),
            SUBSCHEMA_KEYS    = new Set(['items', 'additionalItems', 'additionalProperties', 'unevaluatedProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else']),
            SCHEMA_ARRAY_KEYS = new Set(['oneOf', 'anyOf', 'allOf', 'prefixItems']),
            projected         = {};

        for (const [key, value] of Object.entries(schema)) {
            if (key === 'description') {
                continue // the annotation at THIS schema position
            }

            if (value && typeof value === 'object') {
                if (SCHEMA_MAP_KEYS.has(key)) {
                    projected[key] = Object.fromEntries(
                        Object.entries(value).map(([name, subschema]) => [name, this.stripSchemaDescriptions(subschema)])
                    );
                    continue
                }

                if (SUBSCHEMA_KEYS.has(key)) {
                    projected[key] = this.stripSchemaDescriptions(value);
                    continue
                }

                if (SCHEMA_ARRAY_KEYS.has(key) && Array.isArray(value)) {
                    projected[key] = value.map(subschema => this.stripSchemaDescriptions(subschema));
                    continue
                }
            }

            // type / required / enum / const / default / format / $ref / unknown keys: verbatim.
            projected[key] = value
        }

        return projected
    }

    /**
     * @summary Builds one lazy-loaded handbook entry from OpenAPI metadata.
     * @param {String} toolName        The operation id.
     * @param {Object} operation       Parsed OpenAPI operation.
     * @param {String} fullDescription Full operation description fallback.
     * @param {Object|null} [schemas]  The fully-described JSON schemas (`{inputSchema, outputSchema}`),
     *     passed only when `compactToolSchemas` stripped them from the listing — the prose is
     *     relocated here, never deleted. `null` keeps the pre-compaction entry shape byte-identical.
     * @returns {Object}
     * @protected
     */
    buildToolHandbookEntry(toolName, operation, fullDescription, schemas=null) {
        const
            dedicated = operation['x-neo-tool-handbook'],
            handbook  = dedicated || fullDescription || operation.summary || toolName;

        const entry = {
            toolId     : toolName,
            found      : true,
            title      : operation.summary || toolName,
            description: operation.description || operation.summary || '',
            handbook,
            source     : dedicated ? 'x-neo-tool-handbook' : (operation.description ? 'description' : 'summary')
        };

        if (schemas) {
            entry.inputSchema = schemas.inputSchema;

            if (schemas.outputSchema !== null) {
                entry.outputSchema = schemas.outputSchema
            }
        }

        return entry
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
                toolId : requestedToolId,
                found  : false,
                code   : 'TOOL_NOT_FOUND',
                message: `Tool "${requestedToolId}" does not exist in this MCP server.`
            };
        }

        return entry;
    }

    /**
     * Provides a paginated list of available tools.
     *
     * The carrier tool's description is stamped with {@link ToolService#getAdvertisedSurfaceDigest}
     * so the value travels into the client's schema cache at attach. See
     * {@link ToolService#stampSurfaceDigest} for why the descriptor is the right place to put it.
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
                tools     : me.stampSurfaceDigest(toolsForListing, toolProjection),
                nextCursor: undefined
            };
        }

        const start      = cursor;
        const end        = start + limit;
        const toolsSlice = toolsForListing.slice(start, end);
        const nextCursor = end < toolsForListing.length ? String(end) : undefined;

        return {
            tools: me.stampSurfaceDigest(toolsSlice, toolProjection),
            nextCursor
        };
    }

    /**
     * @summary Stamps the advertised-surface digest into the carrier tool's description.
     *
     * ## Why the descriptor, and not a new tool
     *
     * The staleness this measures is invisible precisely because a stale client never asks again. A
     * new tool would be unreachable to exactly the seats that need it — they attached before it
     * existed. The descriptor is the one surface a stale attachment provably still holds, because
     * holding it is what makes the attachment stale. Pairing it with the live value on the
     * `healthcheck` RESULT gives both halves of the comparison to a client that changed nothing.
     *
     * Returns copies. `allToolsForListing` is a shared cache and the digest is projection-dependent,
     * so stamping in place would leak one projection's digest into another's listing.
     *
     * **Paging is out of scope, deliberately.** The digest covers the whole advertised surface for the
     * projection, but it only rides the page that contains the carrier. A client paging past that page
     * sees no token and must read the absence as `unknown` — never as `current`.
     * @param {Object[]} tools Tools about to be listed.
     * @param {Object|String} [toolProjection] Projection context, as passed to `listTools`.
     * @returns {Object[]}
     * @protected
     */
    stampSurfaceDigest(tools, toolProjection) {
        const me      = this,
              carrier = me.surfaceDigestCarrierTool;

        if (!carrier || !tools.some(tool => tool?.name === carrier)) {
            return tools;
        }

        const digest = me.getAdvertisedSurfaceDigest(toolProjection);

        return tools.map(tool => tool?.name === carrier ? {
            ...tool,
            description: `${tool.description || ''}\n\n${ADVERTISED_SURFACE_DIGEST_LABEL} ${digest}`.trim()
        } : tool)
    }

    /**
     * @summary Reports the surface this server advertises RIGHT NOW for a projection.
     *
     * The result-side half of the comparison. A client compares this against the token its cached
     * `healthcheck` descriptor carries: equal means the attachment was provisioned from this same
     * advertised-surface generation, different means it was not, and **either one missing means
     * `unknown` — never `current`**, because an absent token is indistinguishable from a server that
     * predates the instrument.
     *
     * Equality claims that and nothing more. It is not a guarantee against host-side truncation or
     * paging, which no server-side value can see.
     * @param {Object|String} [toolProjection] Projection context, as passed to `listTools`.
     * @returns {{digest: String, toolCount: Number, carrierTool: String}}
     */
    describeAdvertisedSurface(toolProjection) {
        const me = this;

        me.initializeToolMapping();

        return {
            carrierTool: me.surfaceDigestCarrierTool,
            digest     : me.getAdvertisedSurfaceDigest(toolProjection),
            toolCount  : me.getToolsForProjection(toolProjection).filter(Boolean).length
        }
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
     * @summary Serializes a value with deterministic object-key ordering.
     *
     * `JSON.stringify` preserves insertion order, so two structurally identical schemas built by
     * different code paths serialize differently and would digest differently. That would report a
     * seat as stale for a surface it actually holds — a false positive on the one axis this exists to
     * measure, and the kind that trains readers to ignore the signal.
     * @param {*} value
     * @returns {String}
     * @protected
     */
    canonicalize(value) {
        if (Array.isArray(value)) {
            return `[${value.map(item => this.canonicalize(item)).join(',')}]`
        }

        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${this.canonicalize(value[key])}`).join(',')}}`
        }

        return JSON.stringify(value ?? null)
    }

    /**
     * @summary Digests the tool surface this server ADVERTISES for a given projection.
     *
     * The staleness axis it serves is **capability reachability**: can the caller reach the tools and
     * argument shapes this server currently exposes? A client caches the advertised set at connect and
     * never revalidates, so a capability shipped after that connect is rejected client-side before the
     * call leaves — and the rejection names the stale enum as authoritative, which is how a seat
     * concludes a shipped capability does not exist and reports that as fact.
     *
     * ## What is digested, and why the rest is deliberately excluded
     *
     * **Tool names plus input schemas only.** Descriptions, titles and output schemas are excluded,
     * and that exclusion is load-bearing twice over:
     *
     * 1. **It makes the digest non-recursive.** The digest is published *inside* a tool description,
     *    so digesting descriptions would make the value an input to itself.
     * 2. **It keeps the axis honest.** A reworded description does not make a capability unreachable;
     *    treating that as staleness would cry wolf until seats ignore the signal entirely.
     *
     * Computed over {@link #getToolsForProjection}'s result rather than the raw OpenAPI file, because a
     * profile legitimately advertises a subset — digesting the unfiltered set would report every
     * projected seat as permanently stale.
     *
     * Equality claims exactly one thing: **this attachment was provisioned from the same
     * advertised-surface generation.** It does not claim the host delivered the full list; truncation
     * and paging are a separate, explicitly out-of-scope concern.
     *
     * @param {Object|String} [toolProjection] Projection context, as passed to `listTools`.
     * @returns {String} Short hex digest of the advertised surface.
     */
    getAdvertisedSurfaceDigest(toolProjection) {
        const me = this;

        me.initializeToolMapping();

        const canonicalSurface = me.getToolsForProjection(toolProjection)
            .filter(Boolean)
            .map(tool => ({name: tool.name, inputSchema: tool.inputSchema ?? null}))
            .sort((lhs, rhs) => lhs.name < rhs.name ? -1 : lhs.name > rhs.name ? 1 : 0);

        return crypto.createHash('sha256').update(me.canonicalize(canonicalSurface)).digest('hex').slice(0, 12)
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

        const exactProfile = me.exactToolProfiles?.[context.mode];

        if (exactProfile) {
            return Object.entries(exactProfile.tools).map(([toolName, profileTool]) => {
                const tool = me.allToolsForListing.find(candidate => candidate.name === toolName);

                // Exact-profile schemas are served DESCRIBED by design, compaction or not: a
                // profile is a curated minimal surface (local-readonly-probe exposes 3 tools),
                // and `get_mcp_tool_handbook` itself is policy-refused inside the projection —
                // so the listing is the ONLY surface where the profile's constraint prose
                // (depth bounds, forced flags) can reach a projected seat. Compaction targets
                // the full default listing, never these.
                return profileTool.inputJsonSchema
                    ? {...tool, inputSchema: profileTool.inputJsonSchema}
                    : tool;
            });
        }

        return me.allToolsForListing.filter(tool => me.isToolAllowedForProjection(tool.name, context));
    }

    /**
     * @summary Throws when a tool is not visible through the supplied projection context.
     * @param {String}             toolName
     * @param {Object|String|null} toolProjection
     * @param {String}             [requestedToolName=toolName] Original MCP tool id before alias resolution.
     */
    assertToolProjectionAllows(toolName, toolProjection, requestedToolName=toolName) {
        const me      = this,
              context = me.normalizeToolProjectionContext(toolProjection);

        if (!context || me.isToolAllowedForProjection(toolName, context, requestedToolName)) {
            return;
        }

        const error = new Error(`Tool "${requestedToolName}" is not visible in the ${context.mode || 'unknown'} projection.`);
        error.code   = 'POLICY_REFUSED';
        error.reason = error.message;
        throw error;
    }

    /**
     * @summary Returns the exact-profile input validator for one visible tool.
     * @param {String}             toolName
     * @param {Object|String|null} toolProjection
     * @returns {Object|null}
     * @protected
     */
    getProjectionInputZodSchema(toolName, toolProjection) {
        const context = this.normalizeToolProjectionContext(toolProjection);

        return context
            ? this.exactToolProfiles?.[context.mode]?.tools?.[toolName]?.inputZodSchema || null
            : null;
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
     * @param {String} [requestedToolName=toolName] Original MCP tool id before alias resolution.
     * @returns {Boolean}
     * @protected
     */
    isToolAllowedForProjection(toolName, context, requestedToolName=toolName) {
        const me = this;

        if (context.mode === 'harness-embedded') {
            const visibleTiers = me.harnessToolProjection?.defaultVisibleTiers || [],
                  toolTier     = me.toolProjectionTiers?.[toolName];

            return Boolean(toolTier && visibleTiers.includes(toolTier));
        }

        const exactProfile = me.exactToolProfiles?.[context.mode];

        return Boolean(
            exactProfile &&
            requestedToolName === toolName &&
            Object.hasOwn(exactProfile.tools, toolName)
        );
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
            const type      = schema.type;
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
