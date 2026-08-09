// Neo namespace bootstrap (entry-point invariant): FleetControlBridge and its Neo classes are
// evaluated only after the namespace/core/instance aliases have been installed.
import Neo                               from '../../../src/Neo.mjs';
import * as core                         from '../../../src/core/_export.mjs';
import InstanceManager                   from '../../../src/manager/Instance.mjs';
import express                           from 'express';
import cors                              from 'cors';
import path                              from 'node:path';
import {accessSync, constants, statSync} from 'node:fs';
import {fileURLToPath, pathToFileURL}    from 'node:url';
import {hostHeaderValidation}            from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import AiConfig                          from '../../config.mjs';
import ConfigBase, {PLANE_MEMBER_PATHS}  from '../../configBase.mjs';
import {
    assertPlaneCoherence,
    assertPlaneMemberCoherence,
    collectPlaneMembers,
    resolvePlaneDataRoot
}                                          from '../../planeConfig.mjs';
import AuthService              from '../../mcp/server/shared/services/AuthService.mjs';
import RequestContextService    from '../../mcp/server/shared/services/RequestContextService.mjs';
import TransportService         from '../../mcp/server/shared/services/TransportService.mjs';
import FleetControlBridge       from './FleetControlBridge.mjs';
import {dispatchFleetS1Request} from './fleetServerPolicy.mjs';
import {
    createFleetWireResponse,
    FLEET_WIRE_RESPONSE_STATES,
    inspectFleetWireResponse
} from './fleetWireMethods.mjs';

const
    REPO_ROOT             = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
    STARTED_AT            = new Date().toISOString(),
    SAFE_AUTH_INFO_FIELDS = Object.freeze([
        'userId',
        'username',
        'source',
        'authProvider',
        'authSource',
        'providerBaseUrl',
        'providerUserId',
        'providerUsername',
        'providerDisplayName'
    ]),
    defaultLogger = Object.freeze({
        info : message => console.info(message),
        warn : message => console.warn(message),
        error: message => console.error(message)
    });

/**
 * @summary Asserts that Fleet's Tier-1 data root belongs to one coherent Agent OS plane before the
 * HTTP listener opens. The complete Tier-1 member roster is checked, not only `fleet.dataDir`, so a
 * partially relocated composition fails boot rather than splitting durable state.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {String} [options.rootDir=REPO_ROOT] Canonical checkout root for the plane anchor.
 * @returns {Readonly<Object>} Observed plane identity plus the resolved Fleet root.
 */
export function assertFleetPlaneReady({aiConfig=AiConfig, rootDir=REPO_ROOT}={}) {
    const observed = assertPlaneCoherence({
        planeId          : aiConfig.plane.id,
        dataRoot         : aiConfig.plane.dataRoot,
        canonicalDataRoot: resolvePlaneDataRoot({rootDir})
    });
    const members = collectPlaneMembers({
        memberPaths   : PLANE_MEMBER_PATHS,
        resolvedConfig: aiConfig,
        descriptorData: ConfigBase.config.data
    });

    assertPlaneMemberCoherence({dataRoot: aiConfig.plane.dataRoot, members});

    if (typeof aiConfig.fleet.dataDir !== 'string' || !path.isAbsolute(aiConfig.fleet.dataDir)) {
        throw new Error('Fleet data root must be an absolute path')
    }

    // The config walk proves placement; this proves the elected service actually received its
    // durable mount. Never create the path here: an absent volume would otherwise become an
    // ephemeral directory in the container writable layer and still pass readiness.
    let fleetRootStat;

    try {
        fleetRootStat = statSync(aiConfig.fleet.dataDir);
        accessSync(aiConfig.fleet.dataDir, constants.R_OK | constants.W_OK)
    } catch {
        throw new Error('Fleet data root must exist and be readable/writable')
    }

    if (!fleetRootStat.isDirectory()) {
        throw new Error('Fleet data root must be a directory')
    }

    return Object.freeze({...observed, fleetDataDir: aiConfig.fleet.dataDir})
}

/**
 * @summary Copies the provider-validated identity facts AuthService emitted into an immutable
 * Fleet request context. This is an explicit allowlist: credential/authz fields (`token`, scopes,
 * expiry, arbitrary SDK extras), graph subjects, and the future `ownerPrincipal` cannot cross the
 * S1 boundary by object spread or SDK evolution.
 * @param {Object|undefined} authInfo AuthService-populated `req.auth`.
 * @returns {Readonly<Object>|null} Frozen safe projection, or null when admission proved no identity.
 */
export function createFleetRequestContext(authInfo) {
    if (typeof authInfo?.userId !== 'string' || authInfo.userId.trim().length === 0) {
        return null
    }

    const context = {};

    for (const field of SAFE_AUTH_INFO_FIELDS) {
        const value = authInfo[field];

        if (value !== undefined && value !== null && ['string', 'number', 'boolean'].includes(typeof value)) {
            context[field] = value
        }
    }

    return Object.freeze(context)
}

/**
 * @summary Resolves Fleet's own protected-resource URL for AuthService. A shared deployment
 * `publicUrl` contributes scheme/authority only; Fleet always owns the exact `/fleet` path, so an
 * accidental KB/MC audience cannot authenticate this service.
 * @param {Object} [aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @returns {URL} Fleet protected-resource URL.
 */
export function resolveFleetResourceUrl(aiConfig=AiConfig) {
    let url;

    if (aiConfig.publicUrl) {
        url = new URL(aiConfig.publicUrl)
    } else if (String(aiConfig.mcpHttpHost).includes('://')) {
        url = new URL(aiConfig.mcpHttpHost)
    } else {
        const protocol = ['localhost', '127.0.0.1'].includes(aiConfig.mcpHttpHost) ? 'http' : 'https';
        url = new URL(`${protocol}://${aiConfig.mcpHttpHost}:${aiConfig.fleet.port}`)
    }

    url.pathname = '/fleet';
    url.search   = '';
    url.hash     = '';

    return url
}

/**
 * @summary Adapts third-party pre-dispatch `json` / `send` / `end` error bodies onto Fleet's finite
 * wire contract without changing the status code or security headers. The adapter is exact-route
 * scoped: `/fleet/probe` remains the explicitly out-of-band launch receipt.
 * @param {Object} req Express request.
 * @param {Object} res Express response.
 * @param {Function} next Express continuation.
 * @returns {*} Continuation result.
 */
function adaptFleetWireErrorResponse(req, res, next) {
    if (req.path !== '/fleet') return next();

    const
        end  = res.end.bind(res),
        send = res.send.bind(res);

    let sending = false;

    const normalize = body => {
        if (res.statusCode < 400) return null;

        let candidate = body;

        try {
            if (Buffer.isBuffer(candidate)) {
                candidate = candidate.toString('utf8')
            }

            if (typeof candidate === 'string') {
                candidate = JSON.parse(candidate)
            }

            if (inspectFleetWireResponse(candidate).ok === true && candidate.ok === false) {
                return null
            }
        } catch {/* hostile middleware output is normalized below */}

        return JSON.stringify(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
            error: 'fleet: request not admitted'
        }))
    };

    const prepareJson = body => {
        res.removeHeader('Content-Length');
        res.type('application/json');

        return body
    };

    res.send = body => {
        if (sending) return send(body);

        const normalized = normalize(body);

        if (normalized !== null) {
            body = prepareJson(normalized)
        }

        sending = true;

        try {
            return send(body)
        } finally {
            sending = false
        }
    };

    res.end = (chunk, encoding, callback) => {
        if (sending) return end(chunk, encoding, callback);

        if (typeof chunk === 'function') {
            callback = chunk;
            chunk    = undefined;
            encoding = undefined
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = undefined
        }

        const normalized = normalize(chunk);

        if (normalized === null) {
            return end(chunk, encoding, callback)
        }

        return end(prepareJson(normalized), 'utf8', callback)
    };

    return next()
}

/**
 * @summary Compose the authenticated S1 Fleet HTTP application. Ordering is security-significant:
 * wire-error adapter -> Host guard -> AuthService pre-CORS guard -> canonical CORS -> AuthService ->
 * identity projection -> JSON parser -> exact routes. Authentication therefore refuses an anonymous
 * malformed body before parsing, while the request context is a frozen copy rather than the SDK's
 * mutable AuthInfo.
 * `/fleet` returns the negotiated finite wire envelope; `/fleet/probe` remains an out-of-band
 * liveness probe and never stands in for client-contract readiness.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Object} [options.authService=AuthService] Auth boundary collaborator.
 * @param {Object} [options.transportService=TransportService] Host-allowlist collaborator.
 * @param {Object} [options.logger=defaultLogger] Redaction-safe logger.
 * @param {Function} [options.dispatch] S1 dispatcher override.
 * @param {Function} [options.runInContext] Request-context runner override.
 * @param {Function} [options.planeGuard] Boot-time plane assertion override.
 * @param {Number} [options.maxBodyBytes=1048576] JSON request limit.
 * @returns {Promise<Object>} Configured Express application.
 */
export async function createFleetServerApp({
    aiConfig          = AiConfig,
    authService       = AuthService,
    transportService  = TransportService,
    logger            = defaultLogger,
    dispatch          = request => dispatchFleetS1Request(request, FleetControlBridge),
    runInContext      = (context, callback) => RequestContextService.run(context, callback),
    planeGuard        = assertFleetPlaneReady,
    maxBodyBytes      = 1024 * 1024
}={}) {
    planeGuard({aiConfig});

    const
        app          = express(),
        mcpServerUrl = resolveFleetResourceUrl(aiConfig);

    app.enable('strict routing');
    app.disable('x-powered-by');
    app.use(adaptFleetWireErrorResponse);
    app.use(hostHeaderValidation(transportService.computeAllowedHosts(aiConfig)));

    authService.setupPreCors({app, aiConfig});

    transportService.installCors({
        app,
        aiConfig,
        corsMiddleware: cors,
        resourceUrl   : mcpServerUrl,
        errorBody     : createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
            error: 'fleet: origin not admitted'
        })
    });

    await authService.setup({
        app,
        aiConfig,
        mcpServerUrl,
        logger,
        resourceName: 'Neo Fleet Control Service'
    });

    // AuthService/SDK owns credential validation. Fleet owns the stronger S1 statement that an
    // admitted request is identity-bearing; possession-only local bearer is not silently promoted.
    app.use((req, res, next) => {
        const context = createFleetRequestContext(req.auth);

        if (!context) {
            res.status(401).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: 'fleet: authenticated provider identity required'
            }));
            return
        }

        req.fleetRequestContext = context;
        next()
    });

    app.use(express.json({limit: maxBodyBytes}));

    app.get('/fleet/probe', (req, res) => {
        res.status(200).json({
            ok    : true,
            result: {
                identity    : req.fleetRequestContext,
                fleetDataDir: aiConfig.fleet.dataDir,
                pid         : process.pid,
                startedAt   : STARTED_AT
            }
        })
    });

    app.post('/fleet', async (req, res) => {
        let envelope;

        try {
            envelope = await runInContext(req.fleetRequestContext, () => dispatch(req.body ?? {}))
        } catch (error) {
            logger.error('[FleetServer] dispatch failed');
            envelope = createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.operationFailed, {
                error: 'fleet: request failed'
            })
        }

        res.status(200).json(envelope)
    });

    app.use((req, res) => {
        res.status(404).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
            error: 'fleet: route not found'
        }))
    });

    // Express body-parser errors carry raw parser text; collapse them to stable Fleet envelopes.
    app.use((error, req, res, next) => {
        if (error?.type === 'entity.too.large') {
            res.status(413).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: 'fleet: request body too large'
            }));
            return
        }

        if (error instanceof SyntaxError) {
            res.status(400).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: 'fleet: invalid JSON body'
            }));
            return
        }

        logger.error('[FleetServer] request middleware failed');
        res.status(500).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.operationFailed, {
            error: 'fleet: request failed'
        }))
    });

    return app
}

/**
 * @summary Start the composed Fleet HTTP listener after the plane and AuthService setup gates pass.
 * @param {Object} [options] Options accepted by {@link createFleetServerApp}, plus host/port.
 * @param {String} [options.host] Explicit listener host; otherwise the resolved `mcpListenHost`.
 * @param {Number} [options.port] Listener port; defaults to `fleet.port`.
 * @returns {Promise<http.Server>} Listening HTTP server.
 */
export async function startFleetServer(options={}) {
    const
        aiConfig = options.aiConfig ?? AiConfig,
        logger   = options.logger ?? defaultLogger,
        host     = options.host ?? aiConfig.mcpListenHost,
        port     = options.port ?? aiConfig.fleet.port;

    if (typeof host !== 'string' || host.trim().length === 0) {
        throw new Error('Fleet listener host is required')
    }

    const app = await createFleetServerApp({...options, aiConfig, logger});

    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            logger.info(`[FleetServer] listening on ${host}:${server.address().port}`);
            resolve(server)
        });

        server.once('error', reject)
    })
}

/**
 * @summary CLI entrypoint with clean SIGINT/SIGTERM shutdown.
 * @returns {Promise<void>}
 * @private
 */
async function boot() {
    const server = await startFleetServer();
    const close  = () => server.close(() => process.exit(0));

    process.once('SIGINT', close);
    process.once('SIGTERM', close)
}

const isMain = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
    boot().catch(error => {
        console.error(`[FleetServer] startup refused: ${error?.message ?? error}`);
        process.exitCode = 1
    })
}
