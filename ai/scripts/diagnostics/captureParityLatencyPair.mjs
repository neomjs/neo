/**
 * @module ai/scripts/diagnostics/captureParityLatencyPair
 * @summary Produces the generated-adapter boot + hot-call observations that
 * `parityLatencyPair` evaluates.
 *
 * The public capture specification is data-only. The exact secret-free plan emitted after an
 * installed Codex binary consumed Fleet's generated config reaches this module only through
 * FleetLifecycleService's private handoff; the public object cannot supply a plan, probe callbacks,
 * SDK constructors, Docker commands, timings, or the five derived reproducibility fields. This
 * module owns those facts.
 *
 * Preparation happens before the first timed sample: images are built/warmed once, a fresh
 * project-scoped empty dataset is verified, the image-manifest digest and config head are read,
 * and host load is recorded. The timed loop only starts/stops already-created runtimes. No build,
 * create, volume reset, or page-cache operation occurs inside a sample. Cleanup removes only the
 * uniquely named Compose project and temp plane this actor created, after every sample is captured.
 * @plane host
 */

import {execFile}                        from 'node:child_process';
import crypto                            from 'node:crypto';
import fs                                from 'node:fs/promises';
import net                               from 'node:net';
import os                                from 'node:os';
import path                              from 'node:path';
import {performance}                     from 'node:perf_hooks';
import {Client}                          from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport}            from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport}   from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertServedPlane, readToolJson} from './mcpHealthcheck.mjs';
import {
    MIN_SAMPLES,
    PARITY_BOOT_EVENT,
    PARITY_CACHE_CONVENTION,
    PARITY_HOT_CALL_EVENT,
    evaluateLatencyPair
} from './parityLatencyPair.mjs';

const
    REMOTE_SERVER_KEYS        = Object.freeze(['memory-core', 'knowledge-base']),
    COMPOSE_MEASURED_SERVICES = Object.freeze(['kb-server', 'mc-server', 'capture-ingress']),
    COMPOSE_IMAGE_SERVICES    = Object.freeze([
        'capture-ingress',
        'chroma',
        'embedding-server',
        'kb-server',
        'mc-server'
    ]),
    COMPOSE_FILE_PATHS       = Object.freeze([
        'ai/deploy/docker-compose.dev.yml',
        'ai/deploy/docker-compose.parity-capture.yml'
    ]),
    RUNTIME_CONFIG_PATHS     = Object.freeze([
        'ai/config.mjs',
        'ai/mcp/server/knowledge-base/config.mjs',
        'ai/mcp/server/memory-core/config.mjs'
    ]),
    DEFAULT_CONNECT_TIMEOUT_MS = 120000,
    DEFAULT_RETRY_DELAY_MS     = 250;

/**
 * Installed-consumption discriminator emitted by FleetLifecycleService. This is a producer fact,
 * not a caller-selected capability string.
 * @type {String}
 */
export const SEAT_ADAPTER_PRODUCER = 'installed-codex-mcp-list';

/**
 * @summary SHA-256 over one deterministic JSON value.
 * @param {*} value
 * @returns {String}
 */
function digestCanonical(value) {
    return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

/**
 * @summary True for a finite number strictly greater than zero.
 * @param {*} value
 * @returns {Boolean}
 */
function isPositiveFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * @summary True when an object has exactly the named own keys.
 * @param {*} value
 * @param {String[]} keys
 * @returns {Boolean}
 */
function hasExactKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const actual = Object.keys(value).sort();

    return actual.length === keys.length &&
        actual.every((key, index) => key === [...keys].sort()[index])
}

/**
 * @summary Classify only cold-listener/network races as retryable remote startup failures.
 *
 * Authentication, protocol, health, plane, and identity failures are deterministic evidence and
 * must fail on the first observation. Retrying them for two minutes would hide the real cause behind
 * a generic "not ready" label.
 * @param {*} error
 * @returns {Boolean}
 */
export function isRetryableParityStartupError(error) {
    const
        code = error?.code || error?.cause?.code || '',
        text = `${error?.name || ''} ${error?.message || ''} ${error?.cause?.message || ''}`;

    return [
        'ECONNREFUSED',
        'ECONNRESET',
        'EPIPE',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_SOCKET'
    ].includes(code) ||
        /\b(?:502|503|504)\b|bad gateway|service unavailable|gateway timeout|fetch failed/i.test(text)
}

/**
 * @summary Parse and validate the two loopback remote resources consumed by the capture Compose.
 * @param {Object} capturePlan
 * @returns {{origin: String, port: Number}|{reason: String}}
 */
function parseCaptureOrigin(capturePlan) {
    const urls = {};

    for (const key of REMOTE_SERVER_KEYS) {
        try {
            urls[key] = new URL(capturePlan.servers[key].remote.url)
        } catch {
            return {reason: `capturePlan.servers.${key}.remote.url is not a URL`}
        }
    }

    const
        memoryUrl = urls['memory-core'],
        kbUrl     = urls['knowledge-base'],
        loopback  = new Set(['127.0.0.1', '::1', 'localhost']);

    if (memoryUrl.protocol !== 'http:' ||
        kbUrl.protocol !== 'http:' ||
        !loopback.has(memoryUrl.hostname) ||
        !loopback.has(kbUrl.hostname) ||
        memoryUrl.origin !== kbUrl.origin ||
        memoryUrl.pathname !== '/mc/mcp' ||
        kbUrl.pathname !== '/kb/mcp' ||
        memoryUrl.username ||
        memoryUrl.password ||
        memoryUrl.search ||
        memoryUrl.hash ||
        kbUrl.username ||
        kbUrl.password ||
        kbUrl.search ||
        kbUrl.hash) {
        return {
            reason: 'the default capture actor requires one credential-free loopback ingress origin with ' +
                    'exact /mc/mcp and /kb/mcp resources'
        }
    }

    return {
        origin: memoryUrl.origin,
        port  : Number(memoryUrl.port || 80)
    }
}

/**
 * @summary Validate the closed installed-adapter capture-plan grammar.
 * @param {*} capturePlan
 * @returns {String|null}
 */
function validateCapturePlan(capturePlan) {
    if (!hasExactKeys(capturePlan, [
        'producer',
        'harnessType',
        'repoPath',
        'sourceRoot',
        'expectedIdentity',
        'servers'
    ]) ||
        capturePlan.producer !== SEAT_ADAPTER_PRODUCER ||
        !['codex', 'codex-desktop'].includes(capturePlan.harnessType) ||
        !path.isAbsolute(capturePlan.repoPath || '') ||
        !path.isAbsolute(capturePlan.sourceRoot || '') ||
        !/^@[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/.test(capturePlan.expectedIdentity || '') ||
        !hasExactKeys(capturePlan.servers, REMOTE_SERVER_KEYS)) {
        return 'capturePlan must be the exact secret-free installed Codex receipt emitted by ' +
               'FleetLifecycleService.inspectPreparedRemoteMcpAdapter'
    }

    for (const key of REMOTE_SERVER_KEYS) {
        const server = capturePlan.servers[key];

        if (!hasExactKeys(server, ['name', 'enabled', 'stdio', 'remote']) ||
            server.name !== `neo-mjs-${key}` ||
            server.enabled !== true ||
            !hasExactKeys(server.stdio, ['command', 'args', 'envVars']) ||
            !path.isAbsolute(server.stdio.command || '') ||
            !Array.isArray(server.stdio.args) ||
            server.stdio.args.length === 0 ||
            !server.stdio.args.every(value => typeof value === 'string') ||
            !path.isAbsolute(server.stdio.args[0] || '') ||
            !Array.isArray(server.stdio.envVars) ||
            new Set(server.stdio.envVars).size !== server.stdio.envVars.length ||
            !server.stdio.envVars.every(value => /^[A-Z][A-Z0-9_]*$/.test(value)) ||
            !hasExactKeys(server.remote, ['url', 'credentialEnvVar']) ||
            server.remote.credentialEnvVar !== 'NEO_MCP_REMOTE_TOKEN') {
            return `capturePlan.servers.${key} is not an executable generated-adapter descriptor`
        }
    }

    return parseCaptureOrigin(capturePlan).reason || null
}

/**
 * @summary Checks public capture inputs before any runtime or filesystem side effect.
 * @param {Object} spec
 * @returns {String|null}
 */
export function checkCapturePrerequisites(spec) {
    const {sampleCount, conditions} = spec ?? {};

    const allowedSpecKeys = new Set([
        'sampleCount',
        'conditions',
        'acceptableOverhead'
    ]);
    const unsupportedField = Object.keys(spec || {}).find(key => !allowedSpecKeys.has(key));

    if (unsupportedField) {
        return `unsupported public capture field '${unsupportedField}'. The capture spec is data-only; ` +
               'probe callbacks and runtime capabilities belong to the producer-owned actor.'
    }

    if (!Number.isInteger(sampleCount) || sampleCount < MIN_SAMPLES) {
        return `sampleCount must be an integer of at least ${MIN_SAMPLES}, received ` +
               `${JSON.stringify(sampleCount)}. One reading of a boot latency is not a measurement.`
    }

    if (!hasExactKeys(conditions, ['cacheConvention'])) {
        return 'conditions must contain cacheConvention only. imageDigest, datasetDigest, configHead, ' +
               'runtimeDigest, and hostLoad are producer-owned observations bound before timing; accepting ' +
               'caller values would turn required evidence back into assertions.'
    }

    if (conditions.cacheConvention !== PARITY_CACHE_CONVENTION) {
        return 'conditions.cacheConvention must be exactly PARITY_CACHE_CONVENTION — the ruled regime is ' +
               'images/artifacts warm, measured runtimes cold, data preserved, and no timed rebuild.'
    }

    return null
}

/**
 * @summary Validate the actor's pre-timing observations before any sample is taken.
 * @param {*} conditions
 * @returns {String|null}
 */
function validateBoundConditions(conditions) {
    if (!hasExactKeys(conditions, [
        'cacheConvention',
        'imageDigest',
        'datasetDigest',
        'configHead',
        'runtimeDigest',
        'hostLoad'
    ]) ||
        conditions.cacheConvention !== PARITY_CACHE_CONVENTION ||
        !/^sha256:[0-9a-f]{64}$/i.test(conditions.imageDigest || '') ||
        !/^sha256:[0-9a-f]{64}$/i.test(conditions.datasetDigest || '') ||
        !/^[0-9a-f]{40}$/i.test(conditions.configHead || '') ||
        !/^sha256:[0-9a-f]{64}$/i.test(conditions.runtimeDigest || '') ||
        typeof conditions.hostLoad !== 'string' ||
        !conditions.hostLoad.trim()) {
        return 'capture actor did not bind the exact pre-timing reproducibility conditions'
    }

    return null
}

/**
 * @summary Assemble already-captured per-sample observations without accepting executable probes.
 * @param {Object} spec
 * @param {Number} spec.sampleCount
 * @param {Object[]} spec.observations
 * @param {Object} spec.conditions
 * @param {Number} spec.acceptableOverhead
 * @returns {Object}
 */
export function assembleLatencyPair({
    sampleCount,
    observations,
    conditions,
    acceptableOverhead
} = {}) {
    if (!Array.isArray(observations) || observations.length !== sampleCount) {
        return {
            ok    : false,
            reason: `observations must contain exactly ${sampleCount} complete captured sample(s)`
        }
    }

    const
        bootStdio  = [],
        bootParity = [],
        hotStdio   = [],
        hotParity  = [];

    for (let index = 0; index < observations.length; index++) {
        const sample = observations[index];

        for (const [label, reading] of [
            ['boot.stdio', sample?.boot?.stdio],
            ['boot.parity', sample?.boot?.parity],
            ['hotCall.stdio', sample?.hotCall?.stdio],
            ['hotCall.parity', sample?.hotCall?.parity]
        ]) {
            if (!isPositiveFinite(reading?.memoryCoreMs) ||
                !isPositiveFinite(reading?.knowledgeBaseMs)) {
                return {
                    ok    : false,
                    reason: `sample ${index}: ${label} must be {memoryCoreMs, knowledgeBaseMs} with both a ` +
                            'positive finite reading. A missing per-service value is an unmeasured service, ' +
                            'not a zero, and a flattened figure cannot show which service was measured.'
                }
            }
        }

        bootStdio.push(sample.boot.stdio);
        bootParity.push(sample.boot.parity);
        hotStdio.push(sample.hotCall.stdio);
        hotParity.push(sample.hotCall.parity)
    }

    return evaluateLatencyPair({
        boot: {
            stdioObservations : bootStdio,
            parityObservations: bootParity,
            comparableEvent   : PARITY_BOOT_EVENT
        },
        hotCall: {
            stdioObservations : hotStdio,
            parityObservations: hotParity,
            comparableEvent   : PARITY_HOT_CALL_EVENT
        },
        acceptableOverhead,
        conditions
    })
}

/**
 * @summary Capture the generated-adapter pair through one producer-owned actor.
 *
 * The second argument is the internal FleetLifecycleService handoff plus an optional actor test
 * seam; it is not part of the persisted/public capture grammar.
 * @param {Object} spec
 * @param {Number} spec.sampleCount
 * @param {{cacheConvention: String}} spec.conditions
 * @param {Number} spec.acceptableOverhead Operational bound with no default.
 * @param {Object} [dependencies]
 * @param {Object} [dependencies.capturePlan] Private installed-adapter receipt supplied only by
 *     `FleetLifecycleService.capturePreparedRemoteMcpLatencyPair`.
 * @param {String} [dependencies.planeCredential] Private plane bearer supplied by Fleet's tenant
 *     authority; never read from ambient process state or persisted in the capture plan.
 * @returns {Promise<Object>}
 */
export async function captureParityLatencyPair(spec, {capturePlan, planeCredential} = {}) {
    const blocker = checkCapturePrerequisites(spec);

    if (blocker) {
        return {
            ok    : false,
            reason: blocker
        }
    }

    const planReason = validateCapturePlan(capturePlan);

    if (planReason) {
        return {
            ok     : false,
            blocked: true,
            reason : `${planReason}. Invoke the capture through ` +
                     'FleetLifecycleService.capturePreparedRemoteMcpLatencyPair; the public capture ' +
                     'spec cannot claim or substitute an installed producer.'
        }
    }

    if (typeof planeCredential !== 'string' || !planeCredential) {
        return {
            ok     : false,
            blocked: true,
            reason : 'the private Fleet capture handoff did not supply its resolved plane credential'
        }
    }

    const
        {sampleCount, conditions, acceptableOverhead} = spec,
        activeActor                                   = new ParityLatencyCaptureActor({capturePlan, planeCredential}),
        observations                                  = [];
    let boundConditions;
    let outcome;

    try {
        boundConditions = await activeActor.prepare({
            capturePlan,
            cacheConvention: conditions.cacheConvention
        });

        const conditionReason = validateBoundConditions(boundConditions);

        if (conditionReason) throw new Error(conditionReason);

        for (let index = 0; index < sampleCount; index++) {
            // Alternate topology order to keep a monotonic host-load drift from always favouring
            // the same leg. Each topology still owns its own common t0 for MC + KB.
            const order  = index % 2 === 0 ? ['stdio', 'parity'] : ['parity', 'stdio'];
            const sample = {};

            for (const topology of order) {
                sample[topology] = await activeActor.captureTopology({
                    topology,
                    sampleIndex          : index,
                    capturePlan,
                    expectedDatasetDigest: boundConditions.datasetDigest
                })
            }

            observations.push({
                boot: {
                    stdio : sample.stdio.boot,
                    parity: sample.parity.boot
                },
                hotCall: {
                    stdio : sample.stdio.hotCall,
                    parity: sample.parity.hotCall
                }
            })
        }

        await activeActor.verifySourceBinding?.(boundConditions);

        const result = assembleLatencyPair({
            sampleCount,
            observations,
            conditions: boundConditions,
            acceptableOverhead
        });

        outcome = {
            ...result,
            capture: {
                producer   : SEAT_ADAPTER_PRODUCER,
                harnessType: capturePlan.harnessType,
                sampleCount,
                order      : 'alternating-stdio-first/parity-first'
            }
        }
    } catch (error) {
        outcome = {
            ok    : false,
            reason: `producer-owned parity capture failed: ${error?.message || String(error)}`
        }
    }

    try {
        await activeActor.close?.()
    } catch (error) {
        return {
            ok               : false,
            cleanupUnresolved: true,
            reason           : `${outcome?.reason ? `${outcome.reason}; ` : ''}` +
                               `capture cleanup remains unresolved: ${error?.message || String(error)}`,
            ...(outcome?.ok ? {measurement: outcome} : {})
        }
    }

    return outcome
}

/**
 * @summary Convert MC + KB health payloads into the canonical empty-corpus digest.
 * Empty MC/KB collections are the only corpus whose content can be proven by counts alone. The
 * Memory Core identity proof joins that corpus descriptor so two zero-count but differently bound
 * sessions cannot masquerade as a matched dataset.
 * @param {Object} healthByKey
 * @param {Object} identityProof Canonical read-only `list_permissions` response.
 * @returns {String}
 */
export function deriveDatasetDigest(healthByKey, identityProof) {
    const shape = {
        knowledgeBase: {
            documents: healthByKey?.['knowledge-base']
                ?.database?.connection?.collections?.knowledgeBase?.count
        },
        memoryCore: {
            memories: healthByKey?.['memory-core']
                ?.database?.connection?.collections?.memories?.count,
            summaries: healthByKey?.['memory-core']
                ?.database?.connection?.collections?.summaries?.count
        },
        subject: {
            identity       : identityProof?.identity,
            capabilities   : identityProof?.capabilities,
            grantedToOthers: identityProof?.grantedToOthers
        }
    };

    for (const [label, value] of [
        ['knowledgeBase.documents', shape.knowledgeBase.documents],
        ['memoryCore.memories', shape.memoryCore.memories],
        ['memoryCore.summaries', shape.memoryCore.summaries]
    ]) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`healthcheck did not expose a non-negative integer dataset count for ${label}`)
        }
    }

    if (!/^@[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/.test(shape.subject.identity || '') ||
        !Array.isArray(shape.subject.capabilities) ||
        !Array.isArray(shape.subject.grantedToOthers) ||
        shape.subject.capabilities.length > 0 ||
        shape.subject.grantedToOthers.length > 0) {
        throw new Error(
            'identity proof must bind one canonical subject with an empty permission state for the ' +
            'canonical matched capture dataset'
        )
    }

    return digestCanonical(shape)
}

/**
 * @summary Parse Compose JSON/NDJSON image rows and hash the complete service→image-id manifest.
 * @param {String} output
 * @returns {{digest: String, services: String[]}}
 */
export function deriveImageManifestDigest(output) {
    const source = String(output || '').trim();
    let rows;

    try {
        const parsed = JSON.parse(source);

        rows = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
        rows = source.split('\n').filter(Boolean).map(line => JSON.parse(line))
    }

    const manifest = rows.map(row => ({
        service: row.Service ?? row.service,
        imageId: row.ID ?? row.Id ?? row.id
    })).filter(row => row.service && row.imageId)
        .sort((a, b) => a.service.localeCompare(b.service));
    const byService = new Map(manifest.map(row => [row.service, row.imageId]));

    if (COMPOSE_IMAGE_SERVICES.some(service => !byService.has(service))) {
        throw new Error('docker compose images omitted one or more capture services')
    }

    const bounded = COMPOSE_IMAGE_SERVICES
        .map(service => ({service, imageId: byService.get(service)}))
        .sort((a, b) => a.service.localeCompare(b.service));

    return {
        digest  : digestCanonical(bounded),
        services: bounded.map(row => row.service)
    }
}

/**
 * @summary Internal AC4 actor. All mutating/runtime capabilities live here, never in capture spec.
 * @private
 */
export class ParityLatencyCaptureActor {
    constructor({
        capturePlan,
        planeCredential,
        execFileFn = execFile,
        env = process.env,
        fileSystem = fs,
        host = os,
        now = () => performance.now(),
        ClientClass = Client,
        StdioTransportClass = StdioClientTransport,
        HttpTransportClass = StreamableHTTPClientTransport
    } = {}) {
        const planReason = validateCapturePlan(capturePlan);

        if (planReason) throw new TypeError(planReason);

        this.capturePlan         = capturePlan;
        this.planeCredential     = planeCredential;
        this.sourceRoot         = capturePlan.sourceRoot;
        this.composeFiles       = COMPOSE_FILE_PATHS.map(relative => path.join(this.sourceRoot, relative));
        this.execFileFn          = execFileFn;
        this.env                 = env;
        this.fileSystem          = fileSystem;
        this.host                = host;
        this.now                 = now;
        this.ClientClass         = ClientClass;
        this.StdioTransportClass = StdioTransportClass;
        this.HttpTransportClass  = HttpTransportClass;
        this.composeAttempted    = false;
        this.closed              = false
    }

    /**
     * @summary Warm artifacts and bind all producer-owned conditions before timing.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async prepare({cacheConvention}) {
        const
            capturePlan      = this.capturePlan,
            origin           = parseCaptureOrigin(capturePlan),
            credentialEnvVar = capturePlan.servers['memory-core'].remote.credentialEnvVar,
            credential       = this.planeCredential;

        if (!credential) {
            throw new Error(`required plane bearer env slot '${credentialEnvVar}' is empty`)
        }

        await this.assertPortAvailable(origin.port);

        this.capturePlan  = capturePlan;
        this.credential   = credential;
        this.ingressPort  = origin.port;
        this.chromaPort   = await this.findFreePort();
        this.embeddingPort = await this.findFreePort();
        this.projectName  = `neo-parity-capture-${process.pid}-${Date.now()}`;
        this.stdioDataRoot = await this.fileSystem.mkdtemp(
            path.join(this.host.tmpdir(), 'neo-parity-capture-stdio-')
        );
        const sourceBinding = await this.readSourceBinding();

        this.composeEnv = {
            ...this.env,
            NEO_MCP_HEALTHCHECK_TOKEN        : credential,
            NEO_PARITY_CAPTURE_CHROMA_PORT   : String(this.chromaPort),
            NEO_PARITY_CAPTURE_EMBEDDING_PORT: String(this.embeddingPort),
            NEO_PARITY_CAPTURE_INGRESS_PORT  : String(this.ingressPort),
            NEO_PARITY_CAPTURE_SOURCE_HEAD   : sourceBinding.configHead
        };

        this.composeAttempted = true;
        await this.runDocker([
            'up',
            '--build',
            '--detach',
            'chroma',
            'embedding-server',
            'kb-server',
            'mc-server',
            'capture-ingress'
        ], 'warm capture images and artifacts');
        await this.seedStdioIdentity();
        const warm = await this.connectTopology({
            topology : 'parity',
            startedAt: this.now(),
            capturePlan
        });
        let datasetDigest;

        try {
            datasetDigest = deriveDatasetDigest(warm.healthByKey, warm.identityProof)
        } finally {
            await this.closeSessions(warm.sessions)
        }

        const
            image    = await this.readImageManifestDigest(sourceBinding.configHead),
            load     = this.host.loadavg(),
            hostLoad = `${this.host.platform()}/${this.host.arch()}; cpus=${this.host.cpus().length}; ` +
                          `load1=${load[0].toFixed(2)}; load5=${load[1].toFixed(2)}; load15=${load[2].toFixed(2)}`;

        await this.stopMeasuredServices();

        return {
            cacheConvention,
            imageDigest  : image.digest,
            datasetDigest,
            configHead   : sourceBinding.configHead,
            runtimeDigest: sourceBinding.runtimeDigest,
            hostLoad
        }
    }

    /**
     * @summary Capture one complete topology: cold boot, warm-up, then timed hot call.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async captureTopology({topology, capturePlan, expectedDatasetDigest}) {
        if (!['stdio', 'parity'].includes(topology)) {
            throw new Error(`unknown capture topology '${topology}'`)
        }

        const startedAt = this.now();
        let connected;
        let outcome;
        let primaryError;
        let parityStartAttempted = false;

        try {
            if (topology === 'parity') {
                parityStartAttempted = true;
                await this.runDocker(['start', ...COMPOSE_MEASURED_SERVICES], 'start measured parity runtimes')
            }

            connected = await this.connectTopology({topology, startedAt, capturePlan});

            const initialDigest = deriveDatasetDigest(connected.healthByKey, connected.identityProof);

            if (initialDigest !== expectedDatasetDigest) {
                throw new Error(`${topology} boot did not consume the prepared matched dataset`)
            }

            // One untimed warm-up on the SAME established sessions.
            const warmHealth = await this.callHealthPair(connected.sessions, topology);

            if (deriveDatasetDigest(warmHealth, connected.identityProof) !== expectedDatasetDigest) {
                throw new Error(`${topology} warm-up mutated the matched dataset`)
            }

            const hotEntries = await Promise.all(REMOTE_SERVER_KEYS.map(async key => {
                const start  = this.now();
                const health = await this.callHealth(connected.sessions[key].client, {
                    topology,
                    key
                });

                return [key, {ms: this.now() - start, health}]
            }));
            const hotByKey    = Object.fromEntries(hotEntries);
            const finalHealth = Object.fromEntries(
                hotEntries.map(([key, value]) => [key, value.health])
            );

            if (deriveDatasetDigest(finalHealth, connected.identityProof) !== expectedDatasetDigest) {
                throw new Error(`${topology} timed healthcheck mutated the matched dataset`)
            }

            outcome = {
                boot: {
                    memoryCoreMs   : connected.sessions['memory-core'].bootMs,
                    knowledgeBaseMs: connected.sessions['knowledge-base'].bootMs
                },
                hotCall: {
                    memoryCoreMs   : hotByKey['memory-core'].ms,
                    knowledgeBaseMs: hotByKey['knowledge-base'].ms
                }
            }
        } catch (error) {
            primaryError = error
        }

        const cleanupErrors = [];

        if (connected) {
            try {
                await this.closeSessions(connected.sessions)
            } catch (error) {
                cleanupErrors.push(error)
            }
        }

        if (parityStartAttempted) {
            try {
                await this.stopMeasuredServices()
            } catch (error) {
                cleanupErrors.push(error)
            }
        }

        if (cleanupErrors.length) {
            throw new Error(
                `${primaryError ? `${primaryError.message}; ` : ''}` +
                `${topology} topology cleanup remains unresolved (${cleanupErrors.length} operation(s))`
            )
        }

        if (primaryError) throw primaryError;

        return outcome
    }

    /**
     * @summary Connect MC + KB concurrently from one common t0 and obtain identity-bearing health.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async connectTopology({topology, startedAt, capturePlan}) {
        const settled = await Promise.allSettled(REMOTE_SERVER_KEYS.map(async key => {
            const opened = await this.openSessionWithRetry({
                topology,
                key,
                descriptor: capturePlan.servers[key],
                repoPath  : capturePlan.repoPath
            });

            opened.session.bootMs = this.now() - startedAt;

            return [key, {
                session      : opened.session,
                health       : opened.health,
                identityProof: opened.identityProof
            }]
        }));
        const entries  = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
        const rejected = settled.find(result => result.status === 'rejected');

        if (rejected) {
            const sessions = Object.fromEntries(entries.map(([key, value]) => [key, value.session]));
            let cleanupError;

            try {
                await this.closeSessions(sessions)
            } catch (error) {
                cleanupError = error
            }

            throw new Error(
                `${rejected.reason?.message || String(rejected.reason)}` +
                `${cleanupError ? `; sibling session cleanup failed: ${cleanupError.message}` : ''}`
            )
        }

        const sessions   = Object.fromEntries(entries.map(([key, value]) => [key, value.session]));
        const memoryCore = entries.find(([key]) => key === 'memory-core')?.[1];

        return {
            sessions,
            healthByKey  : Object.fromEntries(entries.map(([key, value]) => [key, value.health])),
            identityProof: memoryCore?.identityProof
        }
    }

    /**
     * @summary Open one SDK session, retrying only the cold remote listener race.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async openSessionWithRetry({topology, key, descriptor, repoPath}) {
        const deadline = Date.now() + DEFAULT_CONNECT_TIMEOUT_MS;
        let lastError;

        do {
            let client;
            let opened;

            try {
                opened = this.createSession({topology, key, descriptor, repoPath});

                client = opened.client;
                try {
                    await this.withTimeout(
                        client.connect(opened.transport),
                        DEFAULT_CONNECT_TIMEOUT_MS,
                        `${topology} ${key} MCP connect`
                    )
                } catch (error) {
                    lastError = error;
                    let cleanupError;

                    try {
                        await this.closeSession({
                            client,
                            transport: opened.transport,
                            topology,
                            key
                        })
                    } catch (caught) {
                        cleanupError = caught
                    }
                    client = null;
                    opened = null;

                    if (cleanupError) {
                        throw new Error(`${error.message}; session cleanup failed: ${cleanupError.message}`)
                    }

                    if (topology === 'stdio' || !isRetryableParityStartupError(error)) {
                        throw error
                    }

                    await new Promise(resolve => setTimeout(resolve, DEFAULT_RETRY_DELAY_MS));
                    continue
                }

                const health        = await this.callHealth(client, {topology, key});
                const identityProof = key === 'memory-core'
                    ? await this.callIdentity(client, {topology})
                    : null;

                return {
                    session: {
                        client,
                        transport: opened.transport,
                        topology,
                        key
                    },
                    health,
                    identityProof
                }
            } catch (error) {
                lastError = error;
                let cleanupError;

                try {
                    await this.closeSession({
                        client,
                        transport: opened?.transport,
                        topology,
                        key
                    })
                } catch (caught) {
                    cleanupError = caught
                }

                if (cleanupError) {
                    lastError = new Error(`${error.message}; session cleanup failed: ${cleanupError.message}`)
                }
                break
            }
        } while (Date.now() < deadline);

        throw new Error(`${topology} ${key} MCP session did not become ready: ${lastError?.message || 'unknown error'}`)
    }

    /**
     * @summary Construct one exact official-SDK transport from the installed capture plan.
     * @param {Object} options
     * @returns {{client: Object, transport: Object}}
     */
    createSession({topology, key, descriptor, repoPath}) {
        const client = new this.ClientClass({
            name   : `neo-parity-capture-${topology}-${key}`,
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        if (topology === 'parity') {
            return {
                client,
                transport: new this.HttpTransportClass(new URL(descriptor.remote.url), {
                    requestInit: {
                        headers: {Authorization: `Bearer ${this.credential}`}
                    }
                })
            }
        }

        const env = {};

        for (const name of descriptor.stdio.envVars) {
            if (this.env[name] !== undefined) env[name] = this.env[name]
        }

        Object.assign(env, this.createStdioCaptureEnv());

        const transport = new this.StdioTransportClass({
            command: descriptor.stdio.command,
            args   : [...descriptor.stdio.args],
            cwd    : repoPath,
            env,
            stderr : 'pipe'
        });

        // Drain without surfacing server logs into the receipt or risking child backpressure.
        transport.stderr?.on?.('data', () => {});

        return {client, transport}
    }

    /**
     * @summary Runtime-only isolation for the stdio leg; no generated file or receipt carries it.
     * @returns {Object}
     */
    createStdioCaptureEnv() {
        const
            root     = this.stdioDataRoot,
            identity = this.capturePlan.expectedIdentity.slice(1),
            under    = relative => path.join(root, relative);

        if (typeof identity !== 'string' || !identity.trim()) {
            throw new Error("stdio capture requires the generated adapter's NEO_AGENT_IDENTITY env value")
        }

        return {
            NEO_AGENT_IDENTITY                          : identity,
            NEO_AI_DAEMON_DIR                           : under('wake-daemon'),
            NEO_AI_DB_PATH                              : under('sqlite/memory-core-graph.sqlite'),
            NEO_AI_ORCHESTRATOR_DIR                     : under('orchestrator-daemon'),
            NEO_AUTH_SEAT_TOKEN_REGISTRY_PATH           : under('seat-tokens/registry.json'),
            NEO_AUTO_DREAM                              : 'false',
            NEO_AUTO_GOLDEN_PATH                        : 'false',
            NEO_AUTO_INGEST_FS                          : 'false',
            NEO_AUTO_SUMMARIZE                          : 'false',
            NEO_AUTO_SYNC                               : 'false',
            NEO_BACKUP_PATH                             : under('backups'),
            NEO_CHROMA_DATA_DIR                         : under('chroma/unified'),
            NEO_CHROMA_HOST                             : '127.0.0.1',
            NEO_CHROMA_PORT                             : String(this.chromaPort),
            NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH   : under('deployment-state/snapshot.json'),
            NEO_EMBEDDING_PROVIDER                      : 'openAiCompatible',
            NEO_FLEET_DATA_DIR                          : under('fleet'),
            NEO_FLEET_INSTANCE_ROOT                     : under('fleet/instances'),
            NEO_GOLDEN_PATH_ROUTE_ATTRIBUTION_LEDGER_DIR: under('orchestrator-daemon/route-attribution'),
            NEO_HEARTBEAT_ALIVE_PATH                    : under('wake-daemon/heartbeat.alive'),
            NEO_HOOK_PROJECTION_ROOT                    : under('hook-projections'),
            NEO_KB_ASK_API_KEY                          : 'neo-parity-ci-key',
            NEO_KB_ASK_BASE_URL                         : `http://127.0.0.1:${this.embeddingPort}`,
            NEO_KB_ASK_MODEL                            : 'gemma-4-31b-it',
            NEO_KB_ASK_PROVIDER                         : 'openAiCompatible',
            NEO_KB_AUTO_START_DATABASE                  : 'false',
            NEO_KB_LOG_PATH                             : under('logs'),
            NEO_LAZY_EDGES_QUEUE_PATH                   : under('memory-core/lazy-edges.jsonl'),
            NEO_MEM_AUTO_START_DATABASE                 : 'false',
            NEO_MEM_AUTO_START_INFERENCE                : 'false',
            NEO_MEMORY_DB_PATH                          : under('sqlite/memory-core-graph.sqlite'),
            NEO_MEMORY_EMBED_DAEMON_DIR                 : under('embed-daemon'),
            NEO_MEMORY_LOG_PATH                         : under('logs'),
            NEO_MEMORY_WAL_DIR                          : under('memory-wal'),
            NEO_MESSAGE_WAL_DAEMON_DIR                  : under('message-daemon'),
            NEO_MODEL_PROVIDER                          : 'openAiCompatible',
            NEO_OPENAI_COMPATIBLE_API_KEY               : 'neo-parity-ci-key',
            NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL       : 'text-embedding-qwen3-embedding-8b',
            NEO_OPENAI_COMPATIBLE_HOST                  : `http://127.0.0.1:${this.embeddingPort}`,
            NEO_PLANE_DATA_ROOT                         : root,
            NEO_PLANE_ID                                : `${this.projectName}-stdio`,
            NEO_REAL_TIME_MEMORY_PARSING                : 'false',
            NEO_RECOVERY_ACTUATOR_HEAL_ATTEMPTS_PATH    : under('orchestrator-daemon/heal-attempts.json'),
            NEO_RECOVERY_ACTUATOR_RUN_STATE_DIR         : under('orchestrator-daemon/recovery-runs'),
            NEO_REM_RUN_STATE_DIR                       : under('rem-runs'),
            NEO_RLAIF_PATH                              : under('datasets/rlaif/trajectories.jsonl'),
            NEO_TRANSPORT                               : 'stdio'
        }
    }

    /**
     * @summary Seed only the expected AgentIdentity into the isolated stdio graph.
     *
     * Provider-PAT HTTP admission auto-provisions this same identity during the untimed preparation
     * pass. Stdio deliberately does not auto-provision, so the capture projects the one canonical
     * registry entry into its isolated graph before timing. This makes the read-only identity proof
     * executable without importing the workstation's native data plane or seeding unrelated roster
     * rows into only one leg.
     * @returns {Promise<void>}
     */
    async seedStdioIdentity() {
        const source = [
            "import {IDENTITIES} from './ai/graph/identityRoots.mjs';",
            "import {seedAgentIdentities} from './ai/scripts/setup/seedAgentIdentities.mjs';",
            "const expected = process.env.NEO_PARITY_CAPTURE_EXPECTED_IDENTITY;",
            "const identity = IDENTITIES.find(item => item.id === expected);",
            "if (!identity) throw new Error('capture identity is absent from the canonical registry');",
            "await seedAgentIdentities({identities: [identity], log: () => {}});"
        ].join('\n');
        const env = {};

        for (const name of ['HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'TMPDIR', 'USER']) {
            if (this.env[name] !== undefined) env[name] = this.env[name]
        }

        Object.assign(env, this.createStdioCaptureEnv(), {
            NEO_PARITY_CAPTURE_EXPECTED_IDENTITY: this.capturePlan.expectedIdentity
        });

        await this.runExec(
            this.capturePlan.servers['memory-core'].stdio.command,
            ['--input-type=module', '--eval', source],
            'seed isolated stdio capture identity',
            {cwd: this.sourceRoot, env}
        )
    }

    /**
     * @summary Invoke the same non-mutating authenticated tool on an established session.
     * @param {Object} client
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async callHealth(client, {topology, key}) {
        const result = await this.withTimeout(
            client.callTool({name: 'healthcheck', arguments: {}}),
            DEFAULT_CONNECT_TIMEOUT_MS,
            `${topology} ${key} healthcheck`
        );

        if (result?.isError) {
            throw new Error(`${topology} ${key} healthcheck returned isError=true`)
        }

        const health = readToolJson(result);

        if (health.status !== 'healthy') {
            throw new Error(`${topology} ${key} healthcheck status is '${health.status || '<missing>'}'`)
        }

        assertServedPlane(health, topology === 'parity'
            ? {
                expectedPlaneId      : this.projectName,
                expectedPlaneDataRoot: '/app/.neo-ai-data-parity'
            }
            : {
                expectedPlaneId      : `${this.projectName}-stdio`,
                expectedPlaneDataRoot: this.stdioDataRoot
            });

        return health
    }

    /**
     * @summary Prove the authenticated Memory Core request resolved the intended canonical seat.
     * @param {Object} client Established Memory Core client.
     * @param {Object} options
     * @returns {Promise<Object>} Canonical empty-permission subject proof.
     */
    async callIdentity(client, {topology}) {
        const result = await this.withTimeout(
            client.callTool({name: 'list_permissions', arguments: {}}),
            DEFAULT_CONNECT_TIMEOUT_MS,
            `${topology} memory-core identity proof`
        );

        if (result?.isError) {
            throw new Error(`${topology} memory-core identity proof returned isError=true`)
        }

        const proof = readToolJson(result);

        if (proof.identity !== this.capturePlan.expectedIdentity ||
            !Array.isArray(proof.capabilities) ||
            !Array.isArray(proof.grantedToOthers) ||
            proof.capabilities.length > 0 ||
            proof.grantedToOthers.length > 0) {
            throw new Error(
                `${topology} memory-core did not bind the canonical empty capture dataset to ` +
                `the intended seat identity '${this.capturePlan.expectedIdentity}'`
            )
        }

        return {
            identity       : proof.identity,
            capabilities   : [],
            grantedToOthers: []
        }
    }

    /**
     * @summary Call health concurrently on both established sessions.
     * @param {Object} sessions
     * @param {String} topology
     * @returns {Promise<Object>}
     */
    async callHealthPair(sessions, topology) {
        return Object.fromEntries(await Promise.all(REMOTE_SERVER_KEYS.map(async key => [
            key,
            await this.callHealth(sessions[key].client, {topology, key})
        ])))
    }

    /**
     * @summary Explicitly DELETE an HTTP session before closing its local SDK transport.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async closeSession({client, transport, topology, key}) {
        const errors = [];

        if (topology === 'parity' &&
            transport?.sessionId &&
            typeof transport.terminateSession === 'function') {
            try {
                await this.withTimeout(
                    transport.terminateSession(),
                    5000,
                    `${topology} ${key} MCP session termination`
                )
            } catch (error) {
                errors.push(error)
            }
        }

        try {
            await client?.close?.()
        } catch (error) {
            errors.push(error)
        }

        if (errors.length) {
            throw new Error(`${topology} ${key} session cleanup failed (${errors.length} operation(s))`)
        }
    }

    /**
     * @summary Terminate and close both sessions independently, surfacing any unresolved cleanup.
     * @param {Object} sessions
     * @returns {Promise<void>}
     */
    async closeSessions(sessions) {
        const settled = await Promise.allSettled(
            Object.values(sessions || {}).map(session => this.closeSession(session))
        );
        const rejected = settled.filter(result => result.status === 'rejected');

        if (rejected.length) {
            throw new Error(`${rejected.length} MCP session cleanup operation(s) remain unresolved`)
        }
    }

    /**
     * @summary Stop only measured servers; dependencies/data remain warm and preserved.
     * @returns {Promise<void>}
     */
    async stopMeasuredServices() {
        await this.runDocker(
            ['stop', ...COMPOSE_MEASURED_SERVICES],
            'stop measured parity runtimes'
        )
    }

    /**
     * @summary Read the clean exact-head source binding and the ignored generated-runtime configs.
     *
     * Git HEAD alone cannot bind a dirty worktree or ignored `config.mjs` leaves. Both checkouts must
     * have no tracked/untracked drift, must resolve the same commit, and the three generated config
     * files consumed by MC/KB are hashed into an explicit runtime digest.
     * @returns {Promise<{configHead: String, runtimeDigest: String}>}
     */
    async readSourceBinding() {
        const
            repoPath                                                                = this.capturePlan.repoPath,
            [configHeadRaw, sourceHeadRaw, repoStatus, sourceStatus, runtimeDigest] = await Promise.all([
                this.runExec('git', ['-C', repoPath, 'rev-parse', 'HEAD'], 'read generated-config checkout head'),
                this.runExec('git', ['-C', this.sourceRoot, 'rev-parse', 'HEAD'], 'read executable-source head'),
                this.runExec(
                    'git',
                    ['-C', repoPath, 'status', '--porcelain=v1', '--untracked-files=all'],
                    'inspect generated-config checkout state'
                ),
                this.runExec(
                    'git',
                    ['-C', this.sourceRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
                    'inspect executable-source state'
                ),
                this.readRuntimeConfigDigest()
            ]),
            configHead = configHeadRaw.trim(),
            sourceHead = sourceHeadRaw.trim();

        if (repoStatus.trim() || sourceStatus.trim()) {
            throw new Error(
                'generated config checkout and executable source must be clean before capture; ' +
                'HEAD cannot bind dirty or untracked runtime bytes'
            )
        }

        if (!/^[0-9a-f]{40}$/i.test(configHead) ||
            !/^[0-9a-f]{40}$/i.test(sourceHead) ||
            configHead !== sourceHead) {
            throw new Error(
                'generated config checkout and installed executable source are not at one exact head'
            )
        }

        return {configHead, runtimeDigest}
    }

    /**
     * @summary Hash the ignored generated configs that the source commit cannot identify.
     * @returns {Promise<String>}
     */
    async readRuntimeConfigDigest() {
        const rows = [];

        for (const relativePath of RUNTIME_CONFIG_PATHS) {
            const content = await this.fileSystem.readFile(path.join(this.sourceRoot, relativePath));

            rows.push({
                path  : relativePath,
                digest: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`
            })
        }

        return digestCanonical(rows)
    }

    /**
     * @summary Recheck source/config/image bindings after the last sample and before issuing a pair.
     * @param {Object} expected Producer-bound pre-timing conditions.
     * @returns {Promise<void>}
     */
    async verifySourceBinding(expected) {
        const [sourceBinding, image] = await Promise.all([
            this.readSourceBinding(),
            this.readImageManifestDigest(expected.configHead)
        ]);

        if (sourceBinding.configHead !== expected.configHead ||
            sourceBinding.runtimeDigest !== expected.runtimeDigest ||
            image.digest !== expected.imageDigest) {
            throw new Error('source, generated runtime config, or image manifest changed during capture')
        }
    }

    /**
     * @summary Execute a project-scoped Compose command without a shell.
     * @param {String[]} args
     * @param {String} label
     * @returns {Promise<String>}
     */
    runDocker(args, label) {
        const composeArgs = ['compose', '-p', this.projectName];

        for (const file of this.composeFiles) composeArgs.push('-f', file);

        return this.runExec('docker', [...composeArgs, ...args], label, {
            cwd: this.sourceRoot,
            env: this.composeEnv
        })
    }

    /**
     * @summary Bind each server image to the exact source revision, then hash the full image manifest.
     * @param {String} expectedHead Exact source revision the server images must package.
     * @returns {Promise<{digest: String, services: String[]}>}
     */
    async readImageManifestDigest(expectedHead) {
        const rows = [];

        for (const service of COMPOSE_IMAGE_SERVICES) {
            const containerId = (await this.runDocker(
                ['ps', '--quiet', service],
                `resolve ${service} capture container`
            )).trim();

            if (!containerId) {
                throw new Error(`capture service '${service}' has no created container`)
            }

            const imageId = (await this.runExec(
                'docker',
                ['inspect', '--format', '{{.Image}}', containerId],
                `read ${service} image id`
            )).trim();

            if (!/^sha256:[0-9a-f]{64}$/i.test(imageId)) {
                throw new Error(`capture service '${service}' has no full immutable image id`)
            }

            if (service === 'kb-server' || service === 'mc-server') {
                await this.assertServerImageSourceBinding({service, imageId, expectedHead})
            }

            rows.push({Service: service, ID: imageId})
        }

        return deriveImageManifestDigest(JSON.stringify(rows))
    }

    /**
     * @summary Prove one MCP server image packages the requested exact commit on all Dockerfile
     * authority surfaces, independent of the host-source bind that covers `/app` at runtime.
     * @param {Object} options
     * @param {String} options.service
     * @param {String} options.imageId
     * @param {String} options.expectedHead
     * @returns {Promise<void>}
     */
    async assertServerImageSourceBinding({service, imageId, expectedHead}) {
        if (!/^[0-9a-f]{40}$/i.test(expectedHead || '')) {
            throw new Error(`capture service '${service}' has no exact expected source head`)
        }

        const
            labels = (await this.runExec(
                'docker',
                [
                    'image',
                    'inspect',
                    '--format',
                    '{{ index .Config.Labels "org.opencontainers.image.revision" }}|' +
                    '{{ index .Config.Labels "org.neomjs.image.requested-ref" }}',
                    imageId
                ],
                `read ${service} source labels`
            )).trim(),
            packagedRevision = (await this.runExec(
                'docker',
                ['run', '--rm', '--entrypoint', 'cat', imageId, '/app/.neo-revision'],
                `read ${service} packaged source revision`
            )).trim();

        if (labels !== `${expectedHead}|${expectedHead}` || packagedRevision !== expectedHead) {
            throw new Error(
                `capture service '${service}' image is not bound to exact source head '${expectedHead}'`
            )
        }
    }

    /**
     * @summary Execute one bounded child command without surfacing its output on failure.
     * @param {String} command
     * @param {String[]} args
     * @param {String} label
     * @param {Object} [options]
     * @returns {Promise<String>}
     */
    runExec(command, args, label, options = {}) {
        return new Promise((resolve, reject) => {
            this.execFileFn(command, args, {
                cwd      : options.cwd || this.sourceRoot,
                env      : options.env || this.env,
                timeout  : 10 * 60 * 1000,
                maxBuffer: 8 * 1024 * 1024
            }, (error, stdout='') => {
                error
                    ? reject(new Error(`${label} failed`))
                    : resolve(String(stdout))
            })
        })
    }

    /**
     * @summary Find one currently unclaimed loopback port.
     * @returns {Promise<Number>}
     */
    findFreePort() {
        return new Promise((resolve, reject) => {
            const server = net.createServer();

            server.unref();
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const {port} = server.address();

                server.close(error => error ? reject(error) : resolve(port))
            })
        })
    }

    /**
     * @summary Refuse before Compose if the generated adapter's ingress port is already claimed.
     * @param {Number} port
     * @returns {Promise<void>}
     */
    assertPortAvailable(port) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();

            server.unref();
            server.once('error', () => reject(
                new Error(`generated capture ingress port ${port} is already claimed`)
            ));
            server.listen(port, '127.0.0.1', () => {
                server.close(error => error ? reject(error) : resolve())
            })
        })
    }

    /**
     * @summary Bound an SDK operation.
     * @param {Promise} promise
     * @param {Number} timeoutMs
     * @param {String} label
     * @returns {Promise<*>}
     */
    async withTimeout(promise, timeoutMs, label) {
        let timer;
        const timeout = new Promise((resolve, reject) => {
            timer = setTimeout(
                () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
                timeoutMs
            )
        });

        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
    }

    /**
     * @summary Remove only this actor's unique project and temp plane after all samples.
     * @returns {Promise<void>}
     */
    async close() {
        if (this.closed) return;

        const operations = [];

        if (this.composeAttempted) {
            operations.push(
                this.runDocker(['down', '--remove-orphans', '--volumes'], 'remove capture project')
            )
        }

        if (this.stdioDataRoot) {
            operations.push(
                this.fileSystem.rm(this.stdioDataRoot, {recursive: true, force: true})
            )
        }

        const rejected = (await Promise.allSettled(operations))
            .filter(result => result.status === 'rejected');

        if (rejected.length) {
            throw new Error(`${rejected.length} capture teardown operation(s) failed`)
        }

        this.closed = true
    }
}
