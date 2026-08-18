import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import path                                            from 'node:path';
import {fileURLToPath}                                 from 'node:url';
import Base                                            from '../../../src/core/Base.mjs';
import {
    assertPlaneCoherence,
    assertPlaneMemberCoherence,
    collectPlaneMembers,
    resolvePlaneDataRoot
} from '../../planeConfig.mjs';
import Tier1ConfigBase, {PLANE_MEMBER_PATHS as TIER1_PLANE_MEMBER_PATHS} from '../../configBase.mjs';
import HeapObservationReporterService                                    from './shared/services/HeapObservationReporterService.mjs';
import ResolvedConfigReporterService                                     from './shared/services/ResolvedConfigReporterService.mjs';

// The durable-root reference for the plane fail-closed check: THIS checkout's ANCHOR plane root.
// The anchor computation reads no env by construction, so this reference cannot drift with the
// process environment — which is exactly what makes it usable as the fixed point a declared
// overlay must not resolve to, whether via env leakage or a symlink layer.
const canonicalDataRoot = resolvePlaneDataRoot({
    rootDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../')
});

/**
 * @summary Common base class for all Neo MCP servers.
 *
 * Standardizes the per-server bootstrap pattern across Neo MCP servers by
 * lifting common boilerplate (`createMcpServer`, ListTools/CallTool handler
 * wiring, result-formatting, transport-connect) into shared template-method
 * scaffolding. Per-server subclasses override a small set of extension hooks
 * rather than duplicating the full bootstrap sequence.
 *
 * ## Extension model
 *
 * Subclasses MUST override:
 * - `getServerMetadata()` — return `{name, version?, capabilities?}`. Drives `McpServer` construction.
 * - `getToolService()` — return `{listTools, callTool}` from the per-server `services/toolService.mjs`.
 *
 * Subclasses MAY override:
 * - `getDependentServices()` — return array of singleton services with a `ready()` method to await.
 * - `getHealthExemptTools()` — return array of tool names exempt from the healthcheck gate.
 * - `getHealthService()` — return per-server `HealthService` (with `healthcheck()` and optional `ensureHealthy()`).
 *   Default `null` means "no health gate"; appropriate for file-system-style minimal servers.
 * - `wrapDispatch(dispatch)` — wrap each tool dispatch in a context (e.g. `RequestContextService.run(...)`
 *   for memory-core's stdio identity binding). Default returns `dispatch()` unchanged.
 * - `buildToolProjectionContext({request, phase, toolName?, args?})` — return an explicit tool
 *   projection context for embedded harness agents. Default `null` preserves the full
 *   developer/operator surface.
 * - `logStartupStatus(health)` — per-server startup log formatting.
 * - `buildRequestContext(reqAuth)` — Streamable-HTTP-only hook called by `TransportService.setup()` for per-request
 *   context construction. Default returns `{}`.
 * - `onSessionClosed(sessionId, mcpServerInstance)` — Streamable-HTTP-only hook called by `TransportService` when
 *   a session disconnects. Default no-op.
 *
 * ## Lifecycle hooks (composable)
 *
 * The default `boot()` runs the canonical sequence (called automatically from `initAsync()`):
 *
 *     loadCustomConfig → beforeMcpServerInit → createMcpServer → waitForDependentServices →
 *     beforeHealthcheck → runHealthcheckAndLogStatus → afterHealthcheck → connectTransport →
 *     afterTransportConnected
 *
 * Each `before*` / `after*` hook is a no-op by default. Subclasses with more complex bootstrap
 * (e.g. memory-core's stdio identity resolution, neural-link's transport-before-service order)
 * may also override `boot()` directly and compose the protected building blocks
 * (`loadCustomConfig`, `createMcpServer`, `waitForDependentServices`, `runHealthcheckAndLogStatus`,
 * `connectTransport`) in a different order.
 *
 * ## Per-server instance state
 *
 * Subclasses must assign these instance members at class-body level:
 * - `aiConfig` — per-server `aiConfig` singleton (imported from `./config.mjs`); may be `null`
 *   for servers that don't load runtime config (file-system).
 * - `logger` — per-server `logger` module; falls back to `console.error` when absent.
 *
 * @class Neo.ai.mcp.server.BaseServer
 * @extends Neo.core.Base
 */
class BaseServer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.BaseServer'
         * @protected
         */
        className: 'Neo.ai.mcp.server.BaseServer'
    }

    /**
     * Per-server `aiConfig` singleton. Subclasses assign at class-body level.
     * `null` for servers without runtime config (file-system).
     * @member {Object|null} aiConfig=null
     */
    aiConfig = null
    /**
     * Path to a custom configuration file (CLI option `-c`).
     * @member {String|null} configFile=null
     */
    configFile = null
    /**
     * Server-instance forced tool-projection mode — the security *ceiling* for the tool surface this
     * instance exposes, set at boot by the spawner (the Fleet Manager when it launches a server for an
     * embedded agent; neural-link's `--tool-projection-mode harness-embedded` CLI flag). When set,
     * {@link buildToolProjectionContext} pins every request to this mode, so a client can NEVER widen
     * its surface by omitting or altering request `_meta` — the projection becomes a server-bound
     * capability, not a client-asserted convention. Default `null` = no ceiling: the full
     * developer/operator surface, for trusted dev/operator-launched servers (back-compat).
     * @member {String|null} toolProjectionMode=null
     */
    toolProjectionMode = null
    /**
     * Per-server `logger` module. Subclasses assign at class-body level.
     * Falls back to `console.error` when null.
     * @member {Object|null} logger=null
     */
    logger = null
    /**
     * The MCP Server instance. Populated by `createMcpServer()`.
     * @member {McpServer|null} mcpServer=null
     * @protected
     */
    mcpServer = null
    /**
     * The transport instance (StdioServerTransport for stdio mode; null for Streamable HTTP mode
     * because TransportService manages per-request transports).
     * @member {Object|null} transport=null
     * @protected
     */
    transport = null

    // ===== Required override hooks =====

    // The two required-override throws below use `className` for the same reason the
    // plane-identity assertion does (see `assertPlaneIdentity()`): every MCP server class is
    // literally named `Server`, so `constructor.name` renders the same string for all of them.
    // These two fire synchronously with the caller's own stack, so the ambiguity is not
    // load-bearing the way the queued-boot case was — but a file that discriminates at two
    // sites and not two others leaves the next misdiagnosis to find the unconverted pair.

    /**
     * @summary Override: return the MCP server metadata.
     * @returns {{name: String, version: String|undefined, capabilities: Object|undefined}}
     */
    getServerMetadata() {
        throw new Error(`${this.className}: must override getServerMetadata() to return {name, version?, capabilities?}`);
    }

    /**
     * @summary Override: return the per-server tool service exposing `listTools` and `callTool`.
     * @returns {{listTools: Function, callTool: Function}}
     */
    getToolService() {
        throw new Error(`${this.className}: must override getToolService() to return {listTools, callTool}`);
    }

    // ===== Optional override hooks (defaults provided) =====

    /**
     * @summary Override: array of singleton services with a `ready()` method to await before
     * transport-connect. Default empty.
     * @returns {Array<Object>}
     */
    getDependentServices() {
        return [];
    }

    /**
     * @summary Override: tool names exempt from the healthcheck gate (always allowed).
     * Default `['healthcheck']`.
     * @returns {Array<String>}
     */
    getHealthExemptTools() {
        return ['healthcheck'];
    }

    /**
     * @summary Override: per-server health service (with `healthcheck()` and optional
     * `ensureHealthy()`). Default `null` disables the health gate entirely.
     * @returns {Object|null}
     */
    getHealthService() {
        return null;
    }

    /**
     * @summary Override: wrap a tool dispatch closure in a runtime context (e.g.
     * `RequestContextService.run()` for memory-core's stdio identity binding). Default
     * invokes `dispatch()` directly with no wrapping.
     * @param {Function} dispatch The closure that invokes the per-server `callTool`.
     * @returns {Promise<*>} The dispatch result.
     */
    async wrapDispatch(dispatch) {
        return dispatch();
    }

    /**
     * @summary Override: resolve the tool-projection context for ListTools / CallTool.
     * Returning `null` preserves the existing full developer/operator surface. Returning
     * `{mode: 'harness-embedded'}` asks the underlying ToolService to apply its OpenAPI-root
     * `x-neo-harness-tool-projection` policy before listing or dispatching tools.
     *
     * This default honors the server-instance {@link toolProjectionMode} ceiling: when the spawner
     * pinned this instance to a mode, every request gets it. Subclasses that read a client narrowing
     * hint (e.g. neural-link's `_meta`) MUST keep the forced mode as the ceiling — a client can never
     * widen past it.
     *
     * **Only `null` / `undefined` is "unset"** (the trusted full-surface launch). Any *configured*
     * value — including an empty/whitespace string from a misconfigured spawner — stays a forced mode
     * and fails CLOSED downstream (`ToolService.isToolAllowedForProjection` returns no tools for any
     * non-`harness-embedded` mode). A truthiness check would erase `''` into the unset/full-surface
     * case — a fail-OPEN on a security launch parameter — so the nullish check is load-bearing.
     * @param {Object} context
     * @param {Object} context.request The raw MCP request.
     * @param {String} context.phase   `listTools` or `callTool`.
     * @returns {Object|String|null}
     */
    buildToolProjectionContext(context) {
        return this.toolProjectionMode != null ? {mode: this.toolProjectionMode} : null;
    }

    /**
     * @summary Override: per-server startup status logging from healthcheck output. Default
     * logs a generic "Server started" line.
     * @param {Object|null} health The healthcheck result, or `null` if no health service.
     */
    logStartupStatus(health) {
        const name = this.getServerMetadata().name;
        (this.logger?.info ? this.logger.info.bind(this.logger) : console.error)(`[${name}] Server started`);
    }

    /**
     * @summary Override (Streamable-HTTP-only): build per-request RequestContext shape from `req.auth`.
     * Invoked by `TransportService.setup()` via duck-typed hook. Default returns `{}` for
     * single-tenant fallthrough.
     * @param {Object|undefined} reqAuth The auth context populated by `AuthService`.
     * @returns {Promise<Object>}
     */
    async buildRequestContext(reqAuth) {
        return {};
    }

    /**
     * @summary Override (Streamable-HTTP-only): hook called by `TransportService` on session disconnect.
     * Default no-op.
     * @param {String} sessionId
     * @param {Object} mcpServerInstance
     */
    onSessionClosed(sessionId, mcpServerInstance) {
        // No-op default
    }

    /**
     * @summary Override (optional): pre-dispatch validation hook fired BEFORE the healthcheck
     * gate. Throw to reject the request — the outer CallTool try/catch routes the error to
     * `formatToolError`. Used by memory-core for `AuthMiddleware.validateNoIdentitySpoof(args)`
     * which must fail-fast on identity-spoofing requests before any other processing.
     * Default no-op.
     *
     * @param {Object} context
     * @param {String} context.toolName The MCP tool name being invoked.
     * @param {Object} context.args     The arguments passed to the tool call.
     * @param {Number} context.t0       The Date.now() timestamp captured at handler entry.
     */
    async beforeToolDispatch(context) {
        // No-op default
    }

    /**
     * @summary Override (optional): hook called when the healthcheck gate rejects a tool call,
     * BEFORE the formatHealthError envelope is returned. Lets per-server augment with telemetry
     * (e.g., knowledge-base's KBRecorderService.log of failed tool dispatch). Default no-op.
     *
     * @param {Object} context
     * @param {String} context.toolName The MCP tool name that was rejected.
     * @param {Object} context.args     The arguments passed to the tool call.
     * @param {Error}  context.error    The healthcheck error.
     * @param {Number} context.t0       The Date.now() timestamp captured at handler entry; lets
     *     telemetry compute duration_ms = Date.now() - t0.
     */
    async onHealthGateFailure(context) {
        // No-op default
    }

    // ===== Optional lifecycle hooks (composable, no-op by default) =====

    /** @summary Hook fired before `createMcpServer()` runs in default `initAsync` sequence. */
    async beforeMcpServerInit()    { /* no-op */ }
    /** @summary Hook fired before healthcheck runs in default `initAsync` sequence. */
    async beforeHealthcheck()      { /* no-op */ }
    /** @summary Hook fired after healthcheck runs in default `initAsync` sequence.
     *  @param {Object|null} health The healthcheck result, or `null` if no health service. */
    async afterHealthcheck(health) { /* no-op */ }
    /** @summary Hook fired after transport-connect completes in default `initAsync` sequence. */
    async afterTransportConnected() { /* no-op */ }

    /**
     * @summary Names this server in the self-reported heap-observation channel, or opts out.
     *
     * **The key is the Compose service label, and that is a contract rather than a convention.** The
     * orchestrator's deployment-state bridge resolves `<serviceKey>.json` from the same allowlist it
     * enumerates services with, and refuses any record whose stamped key differs from the path it read
     * — so a server that returns a name of its own invention publishes a file nothing reads, and a
     * server that returns a *sibling's* name gets its heap attributed to another process.
     *
     * `null` is the default because most servers should not publish: the channel exists for the
     * long-lived, heap-bounded Node services the bridge already observes from outside. Opting in is a
     * one-line declaration rather than a call, so a server cannot half-integrate by declaring intent
     * and forgetting to start anything.
     *
     * @returns {String|null} Compose service label, or `null` to publish nothing.
     */
    getHeapObservationServiceKey() { return null }

    /**
     * @summary Declares which of this server's resolved config values it may publish about itself.
     *
     * ONE hook returning both halves, for the reason the identity hook above is one line: a server
     * that could declare an allowlist separately from a config source can half-integrate — name the
     * values and never supply the tree, or the reverse — and both halves are useless alone.
     *
     * `null` is the default because a server publishes nothing until someone decides what is safe to
     * disclose. That decision is reviewed code, never a runtime input: a deployment that could extend
     * the allowlist could name a credential path.
     *
     * Identity comes from {@link #getHeapObservationServiceKey} rather than a second hook. The name is
     * heap-specific for historical reasons — heap was the first fact a service published about itself
     * — but the value it returns is the compose service label, which is exactly the identity this
     * channel needs. A parallel identity hook could disagree with it, and two service keys for one
     * process is the mis-attribution hazard the heap channel already documents.
     *
     * @returns {Object|null} `{config, allowlist}` — the resolved tree and its `{path, kind}` entries — or `null` to publish nothing.
     */
    getResolvedConfigDisclosure() { return null }

    // ===== Building blocks (callable from overridden initAsync) =====

    /**
     * @summary Loads a custom config file if `--config <path>` was provided. No-op if
     * `aiConfig` is null or `configFile` is unset.
     * @returns {Promise<void>}
     * @protected
     */
    async loadCustomConfig() {
        if (!this.configFile || !this.aiConfig?.load) return;

        try {
            await this.aiConfig.load(this.configFile);
        } catch (error) {
            const log = this.logger?.error?.bind(this.logger) || console.error;
            log('Failed to load configuration:', error);
            throw error;
        }
    }

    /**
     * @summary Constructs an `McpServer` instance from `getServerMetadata()` and wires up
     * the standard ListTools / CallTool request handlers via `setupRequestHandlers()`.
     * Used both at boot and per-request (Streamable HTTP mode) to provision dedicated server objects
     * and avoid SDK lifecycle collisions.
     * @returns {McpServer}
     * @protected
     */
    createMcpServer() {
        const metadata  = this.getServerMetadata();
        const mcpServer = new McpServer({
            name   : metadata.name,
            version: metadata.version || process.env.npm_package_version || '1.0.0'
        }, {
            capabilities: metadata.capabilities || {tools: {listChanged: false}}
        });

        this.setupRequestHandlers(mcpServer);

        return mcpServer;
    }

    /**
     * @summary Wires up the standard MCP request handlers (ListTools + CallTool) on the
     * given `mcpServer`. Health-gate, dispatch-context-wrap, and result-formatting are all
     * applied uniformly via per-server override hooks.
     * @param {McpServer} mcpServer The target MCP server instance.
     * @protected
     */
    setupRequestHandlers(mcpServer) {
        if (!mcpServer) return;

        const toolService   = this.getToolService();
        const healthService = this.getHealthService();
        const exemptTools   = this.getHealthExemptTools();

        // ListTools handler
        mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                const {cursor, limit}     = request.params || {};
                const toolProjection      = await this.buildToolProjectionContext({request, phase: 'listTools'});
                const {tools, nextCursor} = toolService.listTools({cursor, limit, toolProjection});

                const mcpTools = tools.map(tool => ({
                    name        : tool.name,
                    title       : tool.title,
                    description : tool.description,
                    inputSchema : tool.inputSchema,
                    outputSchema: tool.outputSchema,
                    annotations : tool.annotations
                }));

                const result = {tools: mcpTools};

                if (nextCursor) {
                    result.nextCursor = nextCursor;
                }
                return result;
            } catch (error) {
                this.logger?.error?.('[MCP] Error listing tools:', error);
                return {tools: [], nextCursor: undefined, error: error.message};
            }
        });

        // CallTool handler
        mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const {name, arguments: args} = request.params;
            const t0                      = Date.now();

            try {
                this.logger?.debug?.(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));
                const toolProjection = await this.buildToolProjectionContext({request, phase: 'callTool', toolName: name, args});

                // Pre-dispatch validation hook (e.g., memory-core's identity-spoof guard).
                // Throws bubble to the outer catch and route to formatToolError.
                await this.beforeToolDispatch({toolName: name, args, t0});

                if (healthService && !exemptTools.includes(name)) {
                    try {
                        if (healthService.ensureHealthy) {
                            await healthService.ensureHealthy();
                        } else {
                            const health = await healthService.healthcheck();
                            if (health.status !== 'healthy') {
                                throw new Error(`Server unhealthy: ${(health.details || []).join(', ')}`);
                            }
                        }
                    } catch (healthError) {
                        this.logger?.error?.(`[MCP] Health check failed for tool ${name}:`, healthError.message);
                        await this.onHealthGateFailure({toolName: name, args, error: healthError, t0});
                        return this.formatHealthError(name, healthError);
                    }
                }

                const dispatch = () => toolService.callTool(name, args, {toolProjection});
                const result   = await this.wrapDispatch(dispatch);

                return this.formatToolResult(this.attachAdvertisedSurface({name, result, toolProjection}));
            } catch (error) {
                if (error?.code === 'POLICY_REFUSED') {
                    this.logger?.warn?.(`[MCP] Policy refused tool ${name}:`, error.reason || error.message);
                } else {
                    this.logger?.error?.(`[MCP] Error executing tool ${name}:`, error);
                }
                return this.formatToolError(name, error);
            }
        });
    }

    /**
     * @summary Adds the server's live advertised-surface descriptor to the carrier tool's result.
     *
     * The result-side half of the schema-staleness comparison. The descriptor half rides the
     * carrier tool's DESCRIPTION and is therefore frozen in the client's cache at attach; this half is
     * computed per call, so a client that changed nothing holds both an old token and a current one and
     * can tell them apart. `advertisedSurface` is deliberately a separate key from `runtimeFreshness`:
     * that block answers "did my OpenAPI change since I booted", server-against-its-own-disk. This one
     * answers "is the caller holding the surface I currently advertise", which is a different axis and
     * was the one nothing measured.
     *
     * Never throws into the call. A digest that cannot be computed must degrade to a result with no
     * token — which the procedure reads as `unknown` — rather than failing a healthcheck a stale seat
     * may be depending on to diagnose itself.
     *
     * **Stated bound.** The guard tests for the PRESENCE of an `error` key, because that is what
     * `formatToolResult` routes to an error envelope — stamping a surface claim onto a payload about to
     * be rendered as a failure would publish it inside an error. No health service's success path
     * carries that key, so the happy path always stamps. But a service that RETURNS rather than throws
     * a degraded verdict yields no token, and a seat asking a degraded server therefore reads
     * `unknown`. Fail-closed, never a false `current` — and written here rather than left for the next
     * reader to rediscover, because it is the one case where the intent above is only partly served.
     * @param {Object}        context
     * @param {String}        context.name Tool name that was called.
     * @param {*}             context.result Dispatch result.
     * @param {Object|String} [context.toolProjection] Projection the call was dispatched under.
     * @returns {*} The result, augmented when it is the carrier tool's.
     * @protected
     */
    attachAdvertisedSurface({name, result, toolProjection}) {
        const toolService = this.getToolService();

        if (!Neo.isObject(result) || 'error' in result || !toolService?.describeAdvertisedSurface) {
            return result;
        }

        if (name !== toolService.surfaceDigestCarrierTool) {
            return result;
        }

        try {
            return {...result, advertisedSurface: toolService.describeAdvertisedSurface(toolProjection)};
        } catch (error) {
            this.logger?.warn?.('[MCP] Could not describe the advertised surface:', error.message);
            return result;
        }
    }

    /**
     * @summary Formats a successful tool-call result into the MCP `{content, isError, structuredContent?}`
     * envelope. Object results become both text + structured; primitive results become text-only.
     * Object results with an `error` key are routed to error-style envelopes.
     * @param {*} result
     * @returns {Object}
     * @protected
     */
    formatToolResult(result) {
        let contentBlock;
        let isError           = false;
        let structuredContent = null;

        if (Neo.isObject(result)) {
            isError = 'error' in result;

            if (isError) {
                contentBlock = {
                    type: 'text',
                    text: `Tool Error: ${result.error || 'Unknown Error'}. Message: ${result.message || 'No message provided.'}`
                };
            } else {
                contentBlock = {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                };
                structuredContent = result;
            }
        } else {
            contentBlock = {
                type: 'text',
                text: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
            };
            structuredContent = {result};
        }

        const response = {content: [contentBlock], isError};

        if (structuredContent) {
            response.structuredContent = structuredContent;
        }

        return response;
    }

    /**
     * @summary Formats a healthcheck-gate failure into a tool-error envelope.
     * @param {String} toolName
     * @param {Error} healthError
     * @returns {Object}
     * @protected
     */
    formatHealthError(toolName, healthError) {
        return {
            content: [{type: 'text', text: `Cannot execute ${toolName}: ${healthError.message}`}],
            isError: true
        };
    }

    /**
     * @summary Formats an outer dispatch error (uncaught exception during tool execution)
     * into a tool-error envelope.
     * @param {String} toolName
     * @param {Error} error
     * @returns {Object}
     * @protected
     */
    formatToolError(toolName, error) {
        if (error?.code === 'POLICY_REFUSED') {
            const structuredContent = {
                error : 'Policy Refused',
                code  : 'POLICY_REFUSED',
                reason: error.reason || error.message
            };

            if (error.policyId) structuredContent.policyId = error.policyId;
            if (error.action)   structuredContent.action   = error.action;
            if (error.tenet)    structuredContent.tenet    = error.tenet;
            if (error.details)  structuredContent.details  = error.details;

            return {
                content: [{
                    type: 'text',
                    text: `Policy Refused executing ${toolName}: ${structuredContent.reason}`
                }],
                isError: true,
                structuredContent
            };
        }

        return {
            content: [{type: 'text', text: `Error executing ${toolName}: ${error.message}`}],
            isError: true
        };
    }

    /**
     * @summary Awaits `ready()` on each service returned by `getDependentServices()` in
     * declaration order.
     * @returns {Promise<void>}
     * @protected
     */
    async waitForDependentServices() {
        const services = this.getDependentServices();
        for (const service of services) {
            if (service?.ready) {
                await service.ready();
            }
        }
    }

    /**
     * @summary Declares whether this server is a data-plane MEMBER — a server that opens
     * durable plane storage (WAL, SQLite, Chroma) and must therefore prove plane-identity
     * coherence before serving. Membership is an explicit class declaration, never inferred
     * from config shape: API-bridge servers (github-/gitlab-workflow) and isolated test
     * fixtures carry no plane by contract and skip the assertion; member servers override
     * to `true` and then fail LOUD on every unresolvable state (no config, no `plane`
     * subtree) — a member can never silently skip its own invariant.
     * @returns {Boolean}
     * @protected
     */
    isPlaneMember() {
        return false;
    }

    /**
     * @summary The claimed plane-member entries for this server's config — `{path, resolved,
     * default}` per member (see `collectPlaneMembers`). Member servers override to return
     * `collectMemberEntries(...)`; the default empty list keeps non-members and the base
     * class free of member claims.
     * @returns {Object[]}
     * @protected
     */
    getPlaneMembers() {
        return [];
    }

    /**
     * @summary Composes the COMPLETE claimed member set a member server opens: its
     * server-local claims PLUS the inherited Tier-1 claims — both resolved through the
     * SAME per-server config (`this.aiConfig`; Tier-1 leaves resolve via the Provider
     * parent chain). A member server that asserted only its local list would leave the
     * Tier-1 members it consumes (e.g. the Chroma persist dir) boot-orphaned — a local
     * explicit placement must never mask stale Tier-1 members after a root relocation.
     * @param {Object} options
     * @param {String[]} options.localPaths The server's own claimed member paths.
     * @param {Object} options.localDescriptorData The server config base's static `config.data`.
     * @returns {Object[]}
     * @protected
     */
    collectMemberEntries({localPaths, localDescriptorData}) {
        return [
            ...collectPlaneMembers({
                memberPaths   : localPaths,
                resolvedConfig: this.aiConfig,
                descriptorData: localDescriptorData
            }),
            ...collectPlaneMembers({
                memberPaths   : TIER1_PLANE_MEMBER_PATHS,
                resolvedConfig: this.aiConfig,
                descriptorData: Tier1ConfigBase.config.data
            })
        ];
    }

    /**
     * @summary Fail-closed plane-identity assertion on the RESOLVED config values. Placed on
     * this shared building block because every boot order — the default `boot()` and the
     * custom overrides — calls `runHealthcheckAndLogStatus()` after `loadCustomConfig()`,
     * so the assertion also closes the custom-config-file route the leaf's env parser
     * never sees. Non-members (see `isPlaneMember()`) carry no plane by contract and
     * return `null`; declared members fail loud on any unresolvable state.
     * @returns {Object|null} Frozen observed identity `{planeId, dataRoot}`, or `null`.
     * @protected
     */
    assertPlaneIdentity() {
        if (!this.isPlaneMember()) return null;

        // `className`, not `constructor.name`: EVERY MCP server class is named `Server`, so
        // `constructor.name` renders `[Server]` for all of them and cannot identify its own
        // thrower. That ambiguity is not cosmetic — this assertion can fire from a queued boot
        // after the caller has moved on, so the surrounding stack and test context no longer
        // point at the origin. The message is then the only evidence of which server failed.
        // `className` is class-level and survives instance destruction (verified against a
        // destroyed instance), so it still resolves in exactly that late-boot case.
        if (!this.aiConfig) {
            throw new Error(
                `[${this.className}] declared plane member booted without aiConfig — plane identity unresolvable.`
            );
        }
        const {plane} = this.aiConfig;

        if (!plane) {
            throw new Error(
                `[${this.className}] declared plane member resolved no \`plane\` subtree — Tier-1 config not loaded?`
            );
        }
        // Guards overlay-onto-durable mutation, NOT wrong-store service: a server booted from a
        // different checkout resolves a self-consistent canonical and passes this. See the
        // CANNOT-detect section on `assertPlaneCoherence`.
        const observed = assertPlaneCoherence({
            planeId : plane.id,
            dataRoot: plane.dataRoot,
            canonicalDataRoot
        });

        // Member-coherence clause: a relocated plane root with members still on their
        // build-time anchor defaults is a partially-moved plane — fail closed, never split
        // storage across two roots.
        const members = this.getPlaneMembers();

        if (members.length > 0) {
            assertPlaneMemberCoherence({dataRoot: plane.dataRoot, members});
        }
        return observed;
    }

    /**
     * @summary Asserts plane-identity coherence (fail closed before serving), then runs the
     * per-server healthcheck (if any) and emits a startup-status log line.
     * Returns the health result for use by `afterHealthcheck` hooks.
     * @returns {Promise<Object|null>} The healthcheck result, or `null` if no health service.
     * @protected
     */
    async runHealthcheckAndLogStatus() {
        this.assertPlaneIdentity();

        const healthService = this.getHealthService();
        if (!healthService?.healthcheck) {
            this.logStartupStatus(null);
            return null;
        }

        const health = await healthService.healthcheck();
        this.logStartupStatus(health);
        return health;
    }

    /**
     * @summary Connects the configured server transport through an exhaustive, fail-closed selector.
     * Configured servers accept exactly `stdio` and `streamable-http`; config-less local-only
     * servers retain the BaseServer stdio topology. Streamable HTTP delegates to the shared
     * `TransportService` for Express + per-request session lifecycle.
     * @returns {Promise<void>}
     * @protected
     */
    async connectTransport() {
        const metadata  = this.getServerMetadata();
        const transport = !this.aiConfig ? 'stdio' : this.aiConfig.transport;

        if (transport === 'sse') {
            throw new Error(
                `[${metadata.name}] Server transport "sse" was renamed to "streamable-http". ` +
                'Update the configured transport value before restarting the MCP server.'
            );
        }

        if (transport !== 'stdio' && transport !== 'streamable-http') {
            throw new Error(
                `[${metadata.name}] Unsupported server transport "${transport}". ` +
                'Expected "stdio" or "streamable-http".'
            );
        }

        if (transport === 'streamable-http') {
            const {default: TransportService} = await import('./shared/services/TransportService.mjs');

            await TransportService.setup({
                server      : this,
                aiConfig    : this.aiConfig,
                logger      : this.logger,
                resourceName: `${metadata.name} MCP`
            });
        } else {
            const {StdioServerTransport} = await import('@modelcontextprotocol/sdk/server/stdio.js');

            this.transport = new StdioServerTransport();

            // Defensive: an async-boot failure could destroy the mcpServer mid-flight.
            // Preserve the guard before connecting the stdio transport.
            if (!this.mcpServer) return;

            await this.mcpServer.connect(this.transport);

            this.logger?.info?.(`[${metadata.name}] Server started on stdio transport`);
            this.logger?.info?.(`[${metadata.name}] Available tools loaded from OpenAPI spec`);
        }
    }

    /**
     * @summary Async initialization. Chains into `Neo.core.Base.initAsync()`, then delegates
     * the boot orchestration to `boot()`. Subclasses should override `boot()` (NOT `initAsync`)
     * when they need a non-canonical bootstrap order — that keeps the Base class chain
     * (e.g., reactive config init) wired correctly while letting the subclass freely compose
     * the protected building blocks (`loadCustomConfig`, `createMcpServer`,
     * `waitForDependentServices`, `runHealthcheckAndLogStatus`, `connectTransport`).
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await this.boot();
        this.startHeapObservation();
        this.startResolvedConfigReport();
    }

    /**
     * @summary Starts this server's self-reported heap observation, if it declared a service key.
     *
     * **Placed in `initAsync()` rather than `boot()` on purpose.** Subclasses with a non-canonical
     * bootstrap override `boot()` and do NOT call `super.boot()` — memory-core is exactly that case —
     * so a start wired into the default `boot()` would silently skip the servers most worth observing.
     * `initAsync()` is the one point every server passes through, which is what makes a single owner
     * possible instead of one call site per server to forget.
     *
     * **After `boot()`, not before.** The publish directory is a config leaf, and `loadCustomConfig()`
     * runs inside `boot()`; starting earlier would resolve the path against the pre-overlay value and
     * publish into a directory the reader does not watch. The cost is that no observation exists during
     * startup — which the reader already reports honestly as `absent`, never as health.
     *
     * The reporter's `start()` is total by contract, and this is the call site that requires it: a
     * server must not fail to come up because it could not describe its own heap.
     * @returns {void}
     * @protected
     */
    startHeapObservation() {
        const serviceKey = this.getHeapObservationServiceKey();

        if (!serviceKey) return;

        const writeLog = (level, message) => (level === 'ERROR' ? this.logger?.error : this.logger?.info)?.call(this.logger, message);

        HeapObservationReporterService.start({serviceKey, writeLog});

        // Matches the embedding-probe teardown idiom: the interval is unref'd and so never holds the
        // process open, but an explicit stop keeps the timer from firing against a torn-down config.
        process.once('exit', () => this.stopHeapObservation());
    }

    /**
     * @summary Publishes this server's allowlisted resolved config, once, after `boot()`.
     *
     * **After `boot()` for the same reason the heap observation is**, and here it is load-bearing
     * rather than merely tidy: `loadCustomConfig()` runs inside `boot()`, so publishing earlier would
     * disclose the PRE-OVERLAY values. That is not a missing report but a *wrong* one — it would name
     * the defaults as this deployment's effective configuration, which is precisely the false answer
     * this channel exists to replace. A late report reads as `absent` and gets checked; an early one
     * reads as authoritative and does not.
     *
     * No teardown counterpart: the report is written once and owns no timer, so there is nothing to
     * stop and no interval that could fire against a torn-down config.
     *
     * The hook call is guarded because this runs on a booting server. A server must not fail to come
     * up because it could not describe its own configuration — the reporter's `start()` is already
     * total by contract, and this closes the one gap outside it.
     * @returns {void}
     * @protected
     */
    startResolvedConfigReport() {
        const serviceKey = this.getHeapObservationServiceKey();

        if (!serviceKey) return;

        const writeLog = (level, message) => (level === 'WARN' ? this.logger?.error : this.logger?.info)?.call(this.logger, message);

        let disclosure;

        try {
            disclosure = this.getResolvedConfigDisclosure()
        } catch (error) {
            try { writeLog('WARN', `[ResolvedConfigReporter] disclosure declaration FAILED for ${serviceKey}: ${error.message}. This server's effective configuration stays unobservable.`) } catch (ignored) {}

            return
        }

        if (!disclosure) return;

        // Thunks rather than materialised values: the reporter reads them inside its own guard, so a
        // getter that throws degrades the channel instead of the boot.
        ResolvedConfigReporterService.start({
            serviceKey,
            writeLog,
            readConfig   : () => disclosure.config,
            readAllowlist: () => disclosure.allowlist
        })
    }

    /**
     * @summary Stops this server's heap observation. Idempotent, and safe to call on a server that
     * never started one — the reporter owns a single timer and clearing an absent one is a no-op.
     * @returns {void}
     * @protected
     */
    stopHeapObservation() {
        HeapObservationReporterService.stop();
    }

    /**
     * @summary Default canonical bootstrap sequence. Subclasses with custom bootstrap order
     * (e.g. neural-link's transport-before-services for early MCP-handshake handling, or
     * memory-core's stdio-identity-resolution between dependent-services and healthcheck)
     * override this method and call the building blocks (`loadCustomConfig`, `createMcpServer`,
     * etc.) in their own order. Override does NOT need to call `super.boot()` — the Base
     * init chain is already handled by `initAsync()`.
     * @returns {Promise<void>}
     */
    async boot() {
        await this.loadCustomConfig();
        await this.beforeMcpServerInit();

        this.mcpServer = this.createMcpServer();

        await this.waitForDependentServices();
        await this.beforeHealthcheck();

        const health = await this.runHealthcheckAndLogStatus();

        await this.afterHealthcheck(health);
        await this.connectTransport();
        await this.afterTransportConnected();
    }
}

export default Neo.setupClass(BaseServer);
