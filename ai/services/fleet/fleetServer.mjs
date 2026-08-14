// Neo namespace bootstrap (entry-point invariant): FleetControlBridge and its Neo classes are
// evaluated only after the namespace/core/instance aliases have been installed.
import Neo                               from '../../../src/Neo.mjs';
import * as core                         from '../../../src/core/_export.mjs';
import InstanceManager                   from '../../../src/manager/Instance.mjs';
import express                           from 'express';
import {rateLimit}                       from 'express-rate-limit';
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
import AuthService                from '../../mcp/server/shared/services/AuthService.mjs';
import RequestContextService      from '../../mcp/server/shared/services/RequestContextService.mjs';
import TransportService           from '../../mcp/server/shared/services/TransportService.mjs';
import FleetControlBridge         from './FleetControlBridge.mjs';
import {createFleetWakeFanout}    from './fleetWakeFanout.mjs';
import {createFleetWakeReceiver}  from './fleetWakeReceiver.mjs';
import {createPlaneMailboxClient} from './planeMailboxClient.mjs';
import {normalizeAgentIdentity}   from './mcpWireParsing.mjs';
import {resolveFleetViewerClaim}  from './fleetLaunchContract.mjs';
import {dispatchFleetS1Request}   from './fleetServerPolicy.mjs';
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
 * @param {Object} [options.wakeFanout] Wake fan-out registry override (tests); defaults to a
 *     fresh {@link createFleetWakeFanout} instance, exposed on the returned app as
 *     `app.fleetWakeFanout` for the boot entry's arming step.
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
    maxBodyBytes      = 1024 * 1024,
    wakeFanout        = null
}={}) {
    planeGuard({aiConfig});

    const
        app          = express(),
        mcpServerUrl = resolveFleetResourceUrl(aiConfig);

    app.enable('strict routing');
    app.disable('x-powered-by');

    // The signed wake receiver mounts FIRST — before the wire-error adapter, host guard, CORS,
    // and AuthService. Its admission is the per-subscription signed-wake HMAC over the exact
    // body bytes: the dispatcher (`WebhookDeliveryService`) holds no provider
    // bearer and no allowlisted Host header, and the signature is a stronger statement than
    // either. The route is additionally kept OFF the ingress route table — signed AND
    // compose-internal, because reachability is never authentication.
    const fanout = wakeFanout ?? createFleetWakeFanout({logger});

    app.fleetWakeFanout = fanout;

    // Rate bound for the signature-admitted receiver: per KNOWN subscription (their population
    // bounds the store), while every unknown-id request shares ONE bucket — an id-rotating
    // flood cannot inflate the key store and throttles itself into the shared bucket. The
    // window is generous against real coalesced wake cadence and still bounds the per-request
    // HMAC work an unauthenticated caller can demand. Keys never derive from ip, so the
    // X-Forwarded-For validation is explicitly off rather than trusting proxy topology.
    const wakeLimiter = rateLimit({
        windowMs       : 60_000,
        limit          : 120,
        standardHeaders: false,
        legacyHeaders  : false,
        validate       : {xForwardedForHeader: false},
        keyGenerator   : req => {
            const id = req.headers['x-neo-wake-subscription-id'];
            return (typeof id === 'string' && fanout.resolveRoute(id)) ? id : 'unknown-subscription'
        },
        handler: (req, res) => res.status(429).json({error: 'rate-limited'})
    });

    app.post('/wake', wakeLimiter, createFleetWakeReceiver({
        resolveRoute: id => fanout.resolveRoute(id),
        onDigest    : digest => fanout.handleDigest(digest),
        logger
    }));

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

    // The wake push lane's client surface: one SSE stream per connected cockpit, behind the
    // FULL admission chain above (this is a client surface — provider identity required, unlike
    // `/wake`, whose admission is the signature). The stream key is the caller's canonical
    // identity; digests only ever route to the streams of their subscription's identity, so a
    // viewer the push lane is not armed for receives the honest per-viewer `state` event and
    // keeps poll-digest as the truth lane.
    // Connection-attempt bound per authenticated viewer (the key is the admission-proven
    // identity, never an ip behind the ingress); the held-resource bound — concurrent open
    // streams — is the fan-out's own cap, which a request limiter cannot express.
    const eventsLimiter = rateLimit({
        windowMs       : 60_000,
        limit          : 30,
        standardHeaders: false,
        legacyHeaders  : false,
        validate       : {xForwardedForHeader: false},
        keyGenerator   : req => req.fleetRequestContext?.username ?? 'unidentified',
        handler        : (req, res) => res.status(429).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
            error: 'fleet: too many stream attempts'
        }))
    });

    app.get('/fleet/events', eventsLimiter, (req, res) => {
        const identity = normalizeAgentIdentity(req.fleetRequestContext.username);

        if (!identity) {
            res.status(403).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: 'fleet: viewer identity is not canonicalizable'
            }));
            return
        }

        const admitted = fanout.registerStream(identity, res);

        if (!admitted.accepted) {
            res.status(429).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: `fleet: ${admitted.reason}`
            }))
        }
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
 * @summary Arms the wake push lane's relay subscription over the authenticated plane MC surface.
 *
 * FAIL-SOFT by contract: serving never waits on arming, and every refusal path lands as the
 * fan-out's described state (rendered with its reason by the SSE `state` event and the
 * wake-routes axis) rather than a boot failure — an unarmed push lane is a truthful topology,
 * because poll-digest remains the truth lane regardless: push is latency, poll is truth.
 *
 * The plane client lives exactly as long as arming needs it: the subscription row is durable
 * MC state and the rotated signing key is already in fan-out process memory, so the session
 * closes on every exit. A restart re-arms with a fresh key (the one sanctioned rotation door).
 * @param {Object} options
 * @param {Object} options.fanout The app's wake fan-out registry.
 * @param {Object} options.aiConfig Resolved Tier-1 config tree.
 * @param {Object} options.logger Redaction-safe logger.
 * @param {Function} [options.createPlaneClient] Injection seam for tests.
 * @param {Function} [options.resolveViewerClaim] Injection seam for tests.
 * @returns {Promise<Object>} The fan-out's `{armed, reason}` arming outcome.
 */
export async function armFleetWakePushLane({
    fanout,
    aiConfig           = AiConfig,
    logger             = defaultLogger,
    createPlaneClient  = createPlaneMailboxClient,
    resolveViewerClaim = resolveFleetViewerClaim
}) {
    const
        planeBase    = aiConfig.fleet.planeBase.trim(),
        wakeSelfBase = aiConfig.fleet.wakeSelfBase.trim();

    if (!wakeSelfBase) {
        return fanout.armRelaySubscription({identity: null, wakeSelfBase: '', callTool: null})
    }

    if (!planeBase) {
        return fanout.armRelaySubscription({identity: null, wakeSelfBase, callTool: null})
    }

    let client;

    try {
        const viewer = await resolveViewerClaim();

        client = createPlaneClient({
            baseUrl   : `${planeBase.replace(/\/+$/, '')}/mc/mcp`,
            credential: aiConfig.fleet.planeBearer
        });

        const admission = await client.init({expectedIdentity: viewer.agentIdentityNodeId});

        if (!admission.ok) {
            logger.warn(`[FleetServer] wake push lane not armed: plane admission refused (${admission.reason})`);
            return fanout.armRelaySubscription({identity: null, wakeSelfBase, callTool: null})
        }

        const outcome = await fanout.armRelaySubscription({
            identity: normalizeAgentIdentity(admission.identity),
            wakeSelfBase,
            callTool: (name, args) => client.callTool(name, args)
        });

        logger.info(`[FleetServer] wake push lane: ${outcome.reason}`);
        return outcome
    } catch (error) {
        logger.warn(`[FleetServer] wake push lane not armed: ${error?.message ?? error}`);
        return fanout.armRelaySubscription({identity: null, wakeSelfBase, callTool: null})
    } finally {
        await client?.close?.()
    }
}

/**
 * @summary Start the composed Fleet HTTP listener after the plane and AuthService setup gates pass.
 * Wake push-lane arming runs fire-and-forget AFTER the listener is up — the dialable
 * self-address only means anything once `/wake` answers, and serving never waits on the plane.
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

            armFleetWakePushLane({fanout: app.fleetWakeFanout, aiConfig, logger}).catch(error => {
                logger.warn(`[FleetServer] wake push lane arming crashed: ${error?.message ?? error}`)
            });

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
