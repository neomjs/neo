// Neo namespace bootstrap (entry-point invariant): FleetControlBridge and its Neo classes are
// evaluated only after the namespace/core/instance aliases have been installed.
import Neo                                             from '../../../src/Neo.mjs';
import * as core                                       from '../../../src/core/_export.mjs';
import InstanceManager                                 from '../../../src/manager/Instance.mjs';
import express                                         from 'express';
import {rateLimit}                                     from 'express-rate-limit';
import cors                                            from 'cors';
import path                                            from 'node:path';
import {accessSync, constants, readFileSync, statSync} from 'node:fs';
import {fileURLToPath, pathToFileURL}                  from 'node:url';
import {hostHeaderValidation}                          from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import AiConfig                                        from '../../config.mjs';
import ConfigBase, {PLANE_MEMBER_PATHS}                from '../../configBase.mjs';
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
 * @summary Derives the stable admission subject — the opaque `ownerPrincipal` — from the frozen
 * request context's provider-validated facts, and nothing else.
 *
 * The subject is the immutable tuple `(authProvider, normalizedProviderBaseUrl, providerUserId)`:
 * the facts a forge cannot re-issue to someone else. The mutable login NEVER participates — a
 * rename must not move ownership, and a login recycled to a different account must not inherit it.
 * Fail-closed by construction: any absent tuple member (a possession-only admission mode, a
 * provider answer without a numeric id, an unparseable base URL) derives NO subject — the caller
 * renders the refusal; there is no login fallback and no partial principal.
 *
 * Base-URL normalization here is deliberately MINIMAL (URL-parse: lowercased scheme/host by the
 * parser, trailing slashes stripped) and is documented as owned by the durable ownership
 * normalization contract — that contract may reshape these internals; the call sites and the
 * derived-key shape stay.
 * @param {Object|null} requestContext Frozen context from {@link createFleetRequestContext}.
 * @returns {String|null} The opaque principal key
 *     `principal:<authProvider>:<encoded normalized base>:<providerUserId>`, or null.
 */
export function deriveOwnerPrincipal(requestContext) {
    const
        authProvider    = requestContext?.authProvider,
        providerBaseUrl = requestContext?.providerBaseUrl,
        providerUserId  = requestContext?.providerUserId;

    if (typeof authProvider !== 'string' || authProvider === '' ||
        typeof providerBaseUrl !== 'string' || providerBaseUrl === '' ||
        typeof providerUserId !== 'string' || providerUserId === '') {
        return null
    }

    let normalizedProviderBaseUrl;

    try {
        const url = new URL(providerBaseUrl.trim());

        normalizedProviderBaseUrl = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
    } catch {
        return null
    }

    return `principal:${authProvider}:${encodeURIComponent(normalizedProviderBaseUrl)}:${providerUserId}`
}

/**
 * @summary Copies the provider-validated identity facts AuthService emitted into an immutable
 * Fleet request context, then stamps the DERIVED admission subject. This is an explicit
 * allowlist: credential/authz fields (`token`, scopes, expiry, arbitrary SDK extras) and graph
 * subjects cannot cross the S1 boundary by object spread or SDK evolution — and `ownerPrincipal`
 * cannot arrive from the outside either: it exists on a context ONLY as this function's own
 * derivation over the allowlisted facts. A context without a derivable subject stays admitted
 * (possession-proven identity can still read); the verb-class policy decides what such a context
 * may do.
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

    const ownerPrincipal = deriveOwnerPrincipal(context);

    if (ownerPrincipal) {
        context.ownerPrincipal = ownerPrincipal
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
    dispatch          = (request, requestContext) => dispatchFleetS1Request(request, FleetControlBridge, requestContext),
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
        keyGenerator   : req => resolveViewerStreamKey(req.fleetRequestContext, app.fleetWakeArming?.provenIdentity?.() ?? null)
            ?? 'unidentified',
        handler        : (req, res) => res.status(429).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
            error: 'fleet: too many stream attempts'
        }))
    });

    app.get('/fleet/events', eventsLimiter, async (req, res) => {
        const
            proven    = app.fleetWakeArming?.provenIdentity?.() ?? null,
            streamKey = resolveViewerStreamKey(req.fleetRequestContext, proven);

        if (!streamKey) {
            res.status(403).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: 'fleet: viewer identity carries no stable subject'
            }));
            return
        }

        // Connect-time arming, per viewer, with a SEPARATELY CARRIED class-3 credential: the
        // viewer's MC bearer travels in its own header, because the class-1 Fleet admission
        // bearer (the `Authorization` this route was admitted on) must NEVER be forwarded to
        // the `/mc/mcp` audience. A header label alone is not a credential authority — PATs
        // carry no audience claim and both surfaces share the verifier — so the class-1 bytes
        // travel WITH the request into the arming context, which refuses a byte-identical pair
        // before any MC client exists. With a genuinely distinct class-3 credential, the
        // subscription is created by the viewer's own MC authority (caller-owned per viewer),
        // used in-flight only, and the stream registers under the identity MC PROVED — never
        // the request's claim. Without one, the service-proven path answers (arming exactly
        // the proven caller) and every other viewer lands in the honest not-armed state.
        let registrationKey = streamKey;

        if (app.fleetWakeArming) {
            try {
                const
                    fleetBearer    = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim(),
                    mcBearer       = (req.headers['x-neo-mc-authorization'] ?? '').replace(/^Bearer\s+/i, '').trim(),
                    canonicalClaim = normalizeAgentIdentity(req.fleetRequestContext.providerUsername ?? req.fleetRequestContext.username),
                    outcome        = mcBearer && canonicalClaim
                        ? await app.fleetWakeArming.ensureArmedForViewer({viewerKey: streamKey, canonicalClaim, bearer: mcBearer, fleetAdmissionBearer: fleetBearer})
                        : await app.fleetWakeArming.ensureArmedFor(streamKey);

                if (outcome.armed && outcome.identity) {
                    registrationKey = outcome.identity
                }
            } catch (error) {
                logger.warn(`[FleetServer] connect-time arming failed for a viewer stream: ${error?.message ?? error}`)
            }
        }

        const admitted = fanout.registerStream(registrationKey, res);

        // A handshake-rejected stream may already be headers-sent or destroyed — only answer
        // the refusal envelope on a response that can still carry one.
        if (!admitted.accepted && !res.headersSent && !res.destroyed) {
            res.status(429).json(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: `fleet: ${admitted.reason}`
            }))
        }
    });

    app.post('/fleet', async (req, res) => {
        let envelope;

        try {
            envelope = await runInContext(req.fleetRequestContext, () => dispatch(req.body ?? {}, req.fleetRequestContext))
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
 * @summary Resolves the Fleet service's plane bearer from its two declared homes: the direct
 * `fleet.planeBearer` value wins; otherwise `fleet.planeBearerFile` names a secret file (the
 * containerized custody class — the canonical composition mounts its admission token as a
 * compose secret, and a credential does not belong in an env literal). Returns `''` when
 * neither yields a value — the caller decides whether that is an honest unarmed state or a
 * refused boot.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Function} [options.readFile] Injection seam for tests; defaults to `readFileSync`.
 * @returns {String} The resolved bearer, or `''`.
 */
export function resolveFleetPlaneBearer({aiConfig = AiConfig, readFile = null} = {}) {
    const direct = aiConfig.fleet.planeBearer.trim();

    if (direct) return direct;

    const bearerFile = aiConfig.fleet.planeBearerFile.trim();

    if (!bearerFile) return '';

    try {
        const read = readFile ?? (target => readFileSync(target, 'utf8'));
        return String(read(bearerFile)).trim()
    } catch {
        return ''
    }
}

/**
 * @summary The credential-class non-alias teeth: a resolved plane bearer that IS the
 * deployment's bootstrap/healthcheck admission token is refused. The ledger's load-bearing rule
 * (class 3 ≠ bootstrap/healthcheck PAT) is otherwise only prose — this makes an aliased
 * deployment fail at boot, at the one moment someone can mint the distinct credential.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Function} [options.readFile] Injection seam for tests; defaults to `readFileSync`.
 * @returns {String} The class-clean resolved bearer (may be `''`).
 * @throws {Error} When the plane bearer equals the admission token.
 */
export function assertFleetPlaneBearerClass({aiConfig = AiConfig, readFile = null} = {}) {
    const
        read        = readFile ?? (target => readFileSync(target, 'utf8')),
        planeBearer = resolveFleetPlaneBearer({aiConfig, readFile: read});

    if (!planeBearer) return planeBearer;

    const admissionFile = aiConfig.fleet.admissionTokenFile.trim();

    let admissionToken = '';

    if (admissionFile) {
        try {
            admissionToken = String(read(admissionFile)).trim()
        } catch {/* an unreadable admission file leaves the comparison disabled, not the rule */}
    }

    if (admissionToken && planeBearer === admissionToken) {
        throw new Error(
            '[FleetServer] fleet.planeBearer resolves to the deployment\'s bootstrap/healthcheck ' +
            'admission token — the credential-class ledger forbids that aliasing. Mint a distinct ' +
            'class-3 credential for the Fleet service\'s plane sessions.'
        )
    }

    return planeBearer
}

/**
 * @summary Resolves the credential this process presents to a containerized plane's FLEET
 * surface — the fleet-client admission bearer, a DIFFERENT MINT from the plane-MCP bearer
 * (`resolveFleetPlaneBearer`). Same two declared homes, same precedence: the direct
 * `fleet.planeAdmissionBearer` value wins; otherwise `fleet.planeAdmissionBearerFile` names a
 * secret file. Returns `''` when neither yields a value — the caller renders that as an honest
 * unarmed state, never a fallback onto a different credential class.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Function} [options.readFile] Injection seam for tests; defaults to `readFileSync`.
 * @returns {String} The resolved fleet-surface bearer, or `''`.
 */
export function resolveFleetPlaneAdmissionBearer({aiConfig = AiConfig, readFile = null} = {}) {
    const direct = aiConfig.fleet.planeAdmissionBearer.trim();

    if (direct) return direct;

    const bearerFile = aiConfig.fleet.planeAdmissionBearerFile.trim();

    if (!bearerFile) return '';

    try {
        const read = readFile ?? (target => readFileSync(target, 'utf8'));
        return String(read(bearerFile)).trim()
    } catch {
        return ''
    }
}

/**
 * @summary The non-alias teeth for the fleet-client admission bearer: the resolved value must
 * not BE the plane-MCP bearer, and must not BE the bootstrap/healthcheck admission token. Both
 * surfaces can share a verifier, so byte-identity is exactly how one mint silently serves two
 * audiences — this refuses the aliasing at resolution time, at the one moment someone can mint
 * the distinct credential.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Function} [options.readFile] Injection seam for tests; defaults to `readFileSync`.
 * @returns {String} The class-clean resolved bearer (may be `''`).
 * @throws {Error} When the fleet-surface bearer aliases the plane-MCP bearer or the admission token.
 */
export function assertFleetPlaneAdmissionBearerClass({aiConfig = AiConfig, readFile = null} = {}) {
    const
        read            = readFile ?? (target => readFileSync(target, 'utf8')),
        admissionBearer = resolveFleetPlaneAdmissionBearer({aiConfig, readFile: read});

    if (!admissionBearer) return admissionBearer;

    const planeBearer = resolveFleetPlaneBearer({aiConfig, readFile: read});

    if (planeBearer && admissionBearer === planeBearer) {
        throw new Error(
            '[FleetServer] fleet.planeAdmissionBearer resolves to the same bytes as the plane-MCP ' +
            'bearer — the credential-class ledger forbids presenting the MC credential to the ' +
            'fleet surface. Mint a distinct fleet-client admission credential.'
        )
    }

    const admissionFile = aiConfig.fleet.admissionTokenFile.trim();

    let admissionToken = '';

    if (admissionFile) {
        try {
            admissionToken = String(read(admissionFile)).trim()
        } catch {/* an unreadable admission file leaves the comparison disabled, not the rule */}
    }

    if (admissionToken && admissionBearer === admissionToken) {
        throw new Error(
            '[FleetServer] fleet.planeAdmissionBearer resolves to the deployment\'s ' +
            'bootstrap/healthcheck admission token — the credential-class ledger forbids that ' +
            'aliasing. Mint a distinct fleet-client admission credential.'
        )
    }

    return admissionBearer
}

/**
 * @summary Resolves the VIEWER's class-3 MC mint for browser-direct wake arming — the credential
 * the armed bearer handshake serves alongside the process bearer. Same two declared homes, same
 * precedence as its siblings: the direct `fleet.viewerMcAuthorization` value wins; otherwise
 * `fleet.viewerMcAuthorizationFile` names a secret file. Returns `''` when neither yields a
 * value — the honest not-armed default, never a fallback onto a different credential class.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Function} [options.readFile] Injection seam for tests; defaults to `readFileSync`.
 * @returns {String} The resolved viewer MC mint, or `''`.
 */
export function resolveFleetViewerMcAuthorization({aiConfig = AiConfig, readFile = null} = {}) {
    const direct = aiConfig.fleet.viewerMcAuthorization.trim();

    if (direct) return direct;

    const mintFile = aiConfig.fleet.viewerMcAuthorizationFile.trim();

    if (!mintFile) return '';

    try {
        const read = readFile ?? (target => readFileSync(target, 'utf8'));
        return String(read(mintFile)).trim()
    } catch {
        return ''
    }
}

/**
 * @summary The non-alias teeth for the viewer MC mint: the resolved value must not BE the relay's
 * plane-MCP bearer and must not BE the relay's fleet-client admission bearer. The viewer's mint is
 * the VIEWER'S OWN MC authority — arming with a relay-class credential would create subscriptions
 * under the relay's identity while claiming viewer arming, which is exactly the confusion the
 * credential-class ledger exists to refuse. (The third pair — viewer mint vs the fleet PROCESS
 * bearer — is refused where both runtime values meet: the transport's startup validation.)
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Function} [options.readFile] Injection seam for tests; defaults to `readFileSync`.
 * @returns {String} The class-clean resolved viewer mint (may be `''`).
 * @throws {Error} When the viewer mint aliases the plane-MCP bearer or the admission bearer.
 */
export function assertFleetViewerMcAuthorizationClass({aiConfig = AiConfig, readFile = null} = {}) {
    const
        read       = readFile ?? (target => readFileSync(target, 'utf8')),
        viewerMint = resolveFleetViewerMcAuthorization({aiConfig, readFile: read});

    if (!viewerMint) return viewerMint;

    const planeBearer = resolveFleetPlaneBearer({aiConfig, readFile: read});

    if (planeBearer && viewerMint === planeBearer) {
        throw new Error(
            '[FleetServer] fleet.viewerMcAuthorization resolves to the same bytes as the plane-MCP ' +
            'bearer — the viewer mint is the viewer\'s OWN MC authority, never the relay\'s plane ' +
            'credential. Mint a distinct viewer MC credential.'
        )
    }

    const admissionBearer = resolveFleetPlaneAdmissionBearer({aiConfig, readFile: read});

    if (admissionBearer && viewerMint === admissionBearer) {
        throw new Error(
            '[FleetServer] fleet.viewerMcAuthorization resolves to the same bytes as the ' +
            'fleet-client admission bearer — the credential-class ledger forbids that aliasing. ' +
            'Mint a distinct viewer MC credential.'
        )
    }

    return viewerMint
}

/**
 * @summary Derives the ONE stream/limiter key for an admitted viewer, from immutable facts only.
 *
 * The plane-proven canonical identity (`@login`, MC's own subject for the arming caller) is the
 * key exactly when the request's provider login resolves to it — the same fact compared with
 * itself, never an alias. Every other admitted viewer keys on the immutable ownership
 * coordinates (`authProvider` + `providerUserId`): a mutable display name is never a key, a
 * display name with spaces cannot forge one (it canonicalizes to null and falls through to the
 * provider tuple), and a colliding display name cannot cross two viewers onto one key because
 * the tuple differs. Digests only ever carry MC-proven owner identities, so a provider-tuple
 * stream can never receive another owner's digest — it can only be honestly not-armed.
 * @param {Object|null} context Frozen fleet request context.
 * @param {String|null} provenIdentity The arming context's plane-proven canonical identity.
 * @returns {String|null} Stream key, or null when no stable subject exists.
 */
export function resolveViewerStreamKey(context, provenIdentity) {
    if (!context) return null;

    const canonical = normalizeAgentIdentity(context.providerUsername ?? context.username);

    if (provenIdentity && canonical && canonical === provenIdentity) {
        return provenIdentity
    }

    if (context.authProvider && (context.providerUserId ?? '') !== '') {
        return `provider:${context.authProvider}:${context.providerUserId}`
    }

    return null
}

/**
 * @summary Creates the persistent wake-arming context: one proven plane client shared by the
 * boot arming step and every connect-time ensure, with single-flight per-viewer outcomes.
 *
 * FAIL-SOFT by contract: serving never waits on arming, and every refusal path lands as the
 * fan-out's described state (rendered with its reason by the SSE `state` event and the
 * wake-routes axis) rather than a boot failure — an unarmed push lane is a truthful topology,
 * because poll-digest remains the truth lane regardless: push is latency, poll is truth.
 *
 * Authorization boundary, stated where it binds: MC wake subscriptions are CALLER-owned and MC
 * refuses delegation, so this context can arm exactly one viewer — the identity the plane
 * client's `init` proof establishes. `ensureArmedFor(anyOtherViewer)` answers the honest
 * not-armed-for-this-viewer outcome without touching MC; it never relabels the caller-owned
 * subscription as someone else's route.
 * @param {Object} options
 * @param {Object} options.fanout The app's wake fan-out registry.
 * @param {Object} [options.aiConfig=AiConfig] Resolved Tier-1 config tree.
 * @param {Object} [options.logger=defaultLogger] Redaction-safe logger.
 * @param {Function} [options.createPlaneClient] Injection seam for tests.
 * @param {Function} [options.resolveViewerClaim] Injection seam for tests.
 * @returns {Object} `{ensureArmedFor, provenIdentity, close}`
 */
export function createWakeArmingContext({
    fanout,
    aiConfig           = AiConfig,
    logger             = defaultLogger,
    createPlaneClient  = createPlaneMailboxClient,
    resolveViewerClaim = resolveFleetViewerClaim
}) {
    const
        planeBase    = aiConfig.fleet.planeBase.trim(),
        wakeSelfBase = aiConfig.fleet.wakeSelfBase.trim();

    let
        client       = null,
        closed       = false,
        proven       = null,
        establishing = null;

    const outcomesByViewer = new Map(); // viewer key -> settled arming outcome

    async function establish() {
        if (closed) return {ok: false, reason: 'not-armed: arming context closed'};
        if (proven) return {ok: true};
        if (!wakeSelfBase) return {ok: false, reason: 'not-armed: fleet.wakeSelfBase undeclared'};
        if (!planeBase) return {ok: false, reason: 'not-armed: no authenticated plane client'};

        establishing ??= (async () => {
            try {
                const viewer = await resolveViewerClaim();

                client = createPlaneClient({
                    baseUrl            : `${planeBase.replace(/\/+$/, '')}/mc/mcp`,
                    credential         : assertFleetPlaneBearerClass({aiConfig}),
                    allowPlainHttpHosts: aiConfig.fleet.planeInternalHosts
                });

                const admission = await client.init({expectedIdentity: viewer.agentIdentityNodeId});

                if (!admission.ok) {
                    client = null;
                    return {ok: false, reason: `not-armed: plane admission refused (${admission.reason})`}
                }

                proven = normalizeAgentIdentity(admission.identity);
                return {ok: true}
            } catch (error) {
                client = null;
                return {ok: false, reason: `not-armed: ${error?.message ?? error}`}
            } finally {
                establishing = null
            }
        })();

        return establishing
    }

    return {
        /**
         * @summary Establishes (once, single-flight) the proven plane session. Safe to call
         * repeatedly; failures are returned, never thrown.
         * @returns {Promise<Object>} `{ok, reason?}`
         */
        establish,

        /**
         * @summary The plane-proven canonical identity, or null before/without proof.
         * @returns {String|null}
         */
        provenIdentity() {
            return proven
        },

        /**
         * @summary Ensures the relay subscription for one viewer key — single-flight per
         * viewer (a settled ARMED outcome is cached; a failure clears its latch so the next
         * connect retries), safe to call on every connect. Establish-class failures are
         * reflected into the fan-out's described state so the SSE `state` event and the
         * wake-routes axis carry the reason.
         * @param {String} viewerKey Stream key from {@link resolveViewerStreamKey}.
         * @returns {Promise<Object>} `{armed, reason}` outcome for this viewer.
         */
        ensureArmedFor(viewerKey) {
            if (closed) {
                return Promise.resolve({armed: false, reason: 'not-armed: arming context closed'})
            }

            const pending = outcomesByViewer.get(viewerKey);

            if (pending) return pending;

            const mutation = (async () => {
                const ready = await establish();

                if (!ready.ok) {
                    return fanout.armRelaySubscription({
                        identity    : null,
                        wakeSelfBase: ready.reason.includes('wakeSelfBase') ? '' : wakeSelfBase,
                        callTool    : null
                    })
                }

                if (viewerKey !== proven) {
                    return {armed: false, reason: 'not-armed: MC subscriptions are caller-owned; this viewer is not the proven plane identity'}
                }

                const outcome = await fanout.armRelaySubscription({
                    identity: proven,
                    wakeSelfBase,
                    callTool: (name, args) => client.callTool(name, args)
                });

                logger.info(`[FleetServer] wake push lane (${viewerKey}): ${outcome.reason}`);
                return outcome
            })().then(outcome => {
                if (!outcome.armed) {
                    outcomesByViewer.delete(viewerKey)
                }

                return outcome
            }, error => {
                outcomesByViewer.delete(viewerKey);
                throw error
            });

            outcomesByViewer.set(viewerKey, mutation);
            return mutation
        },

        /**
         * @summary Arms one ADMITTED viewer with the viewer's OWN presented plane bearer — the
         * MC-authorized per-viewer ownership path: the subscription is created by the viewer's
         * credential, so MC's caller-owned model holds per viewer with no delegation surface
         * and no privilege beyond what the viewer already presented to this server. The bearer
         * is used in-flight for exactly one ephemeral session (init proof → subscribe →
         * rotate-key → close) and never stored; the route binds to the identity MC PROVES for
         * that bearer, never to the request's claim. Single-flight + retry semantics per
         * viewer, same as {@link ensureArmedFor}.
         * @param {Object} options
         * @param {String} options.viewerKey Pre-arming stream key (latch + cache key).
         * @param {String} options.canonicalClaim The viewer's canonical `@login` claim, proven
         *     against MC by the session init.
         * @param {String} options.bearer The viewer's own presented plane credential.
         * @param {String} [options.fleetAdmissionBearer=''] The class-1 bearer the request was
         *     admitted on — supplied so THIS seam can refuse a byte-identical pair: a header
         *     label is not a credential authority, and PATs carry no audience claim, so
         *     equality here IS the forbidden class-1→class-3 forwarding, refused before any
         *     MC client exists.
         * @returns {Promise<Object>} `{armed, reason, identity?}` — `identity` is MC-proven.
         */
        ensureArmedForViewer({viewerKey, canonicalClaim, bearer, fleetAdmissionBearer = ''}) {
            if (closed) {
                return Promise.resolve({armed: false, reason: 'not-armed: arming context closed'})
            }

            const pending = outcomesByViewer.get(viewerKey);

            if (pending) return pending;

            const mutation = (async () => {
                if (!wakeSelfBase) {
                    return fanout.armRelaySubscription({identity: null, wakeSelfBase: '', callTool: null})
                }

                if (!planeBase || typeof bearer !== 'string' || bearer.length === 0 || !canonicalClaim) {
                    return {armed: false, reason: 'not-armed: no per-viewer plane credential presented'}
                }

                if (fleetAdmissionBearer && bearer === fleetAdmissionBearer) {
                    return {armed: false, reason: 'not-armed: the presented MC credential is byte-identical to the Fleet admission bearer — the credential-class ledger forbids the aliasing'}
                }

                let viewerClient;

                try {
                    viewerClient = createPlaneClient({
                        baseUrl            : `${planeBase.replace(/\/+$/, '')}/mc/mcp`,
                        credential         : bearer,
                        allowPlainHttpHosts: aiConfig.fleet.planeInternalHosts
                    });

                    const admission = await viewerClient.init({expectedIdentity: canonicalClaim});

                    if (!admission.ok) {
                        return {armed: false, reason: `not-armed: viewer admission refused (${admission.reason})`}
                    }

                    const identity = normalizeAgentIdentity(admission.identity);

                    const outcome = await fanout.armRelaySubscription({
                        identity,
                        wakeSelfBase,
                        callTool: (name, args) => viewerClient.callTool(name, args)
                    });

                    logger.info(`[FleetServer] wake push lane (${identity}): ${outcome.reason}`);
                    return {...outcome, identity}
                } catch (error) {
                    return {armed: false, reason: `not-armed: ${error?.message ?? error}`}
                } finally {
                    await viewerClient?.close?.()
                }
            })().then(outcome => {
                if (!outcome.armed) {
                    outcomesByViewer.delete(viewerKey)
                }

                return outcome
            }, error => {
                outcomesByViewer.delete(viewerKey);
                throw error
            });

            outcomesByViewer.set(viewerKey, mutation);
            return mutation
        },

        /**
         * @summary Closes the proven plane session and forgets per-viewer outcomes.
         * @returns {Promise<void>}
         */
        async close() {
            // The epoch closes synchronously BEFORE any teardown await: an in-flight mutation
            // that resolves after this instant finds a closed context and a disposed fan-out,
            // and ends unarmed instead of resurrecting state into a shutdown.
            closed = true;

            outcomesByViewer.clear();
            proven = null;

            const closing = client;
            client = null;

            await closing?.close?.()
        }
    }
}

/**
 * @summary Boot arming step: establishes the proven plane session and arms the push lane for
 * the proven identity through the SAME context connect-time ensures ride. Kept as the named
 * boot-path falsifier surface — a spec drives THIS function (with its seams) to `armed`.
 * @param {Object} options Options of {@link createWakeArmingContext}, plus:
 * @param {Object} [options.armingContext] Existing context override (the server's own).
 * @returns {Promise<Object>} The `{armed, reason}` arming outcome for the proven identity.
 */
export async function armFleetWakePushLane({armingContext = null, ...contextOptions}) {
    const
        context = armingContext ?? createWakeArmingContext(contextOptions),
        logger  = contextOptions.logger ?? defaultLogger;

    try {
        const ready = await context.establish();

        if (!ready.ok) {
            logger.warn(`[FleetServer] wake push lane: ${ready.reason}`);
            // Reflect the refusal into the fan-out's rendered state through the same door.
            return context.ensureArmedFor(context.provenIdentity() ?? 'unproven')
        }

        return context.ensureArmedFor(context.provenIdentity())
    } catch (error) {
        logger.warn(`[FleetServer] wake push lane not armed: ${error?.message ?? error}`);
        return {armed: false, reason: `not-armed: ${error?.message ?? error}`}
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

    // A DECLARED wake push lane with no service credential is a dead feature wearing a live
    // topology — this boot refuses loudly instead of arming nothing and letting the first
    // plane witness discover it. The class teeth run in the same breath: an ALIASED credential
    // (the bootstrap/healthcheck admission token standing in for the class-3 plane bearer)
    // throws its own refusal before the dead-feature check can even read it.
    if (aiConfig.fleet.wakeSelfBase.trim() && aiConfig.fleet.planeBase.trim() &&
        assertFleetPlaneBearerClass({aiConfig}) === ''
    ) {
        throw new Error(
            '[FleetServer] wake push lane is declared (fleet.wakeSelfBase + fleet.planeBase) but no ' +
            'plane credential resolves — set fleet.planeBearer or fleet.planeBearerFile, or unset ' +
            'fleet.wakeSelfBase. Refusing to boot a dead feature.'
        )
    }

    const app = await createFleetServerApp({...options, aiConfig, logger});

    app.fleetWakeArming = options.wakeArmingContext ?? createWakeArmingContext({
        fanout: app.fleetWakeFanout,
        aiConfig,
        logger,
        ...(options.createPlaneClient  ? {createPlaneClient : options.createPlaneClient}  : {}),
        ...(options.resolveViewerClaim ? {resolveViewerClaim: options.resolveViewerClaim} : {})
    });

    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            logger.info(`[FleetServer] listening on ${host}:${server.address().port}`);

            armFleetWakePushLane({armingContext: app.fleetWakeArming, logger}).catch(error => {
                logger.warn(`[FleetServer] wake push lane arming crashed: ${error?.message ?? error}`)
            });

            resolve(server)
        });

        // Held SSE responses would keep `server.close()` waiting forever: disposal of the
        // fan-out (which ENDS every held stream) and the proven plane session must precede the
        // close-callback wait, on every shutdown path that goes through `server.close()`.
        const originalClose = server.close.bind(server);

        server.close = callback => {
            app.fleetWakeFanout.dispose();
            app.fleetWakeArming.close().catch(() => {/* session teardown is best-effort on shutdown */});
            return originalClose(callback)
        };

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
