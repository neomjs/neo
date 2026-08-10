import crypto                from 'node:crypto';
import fs                    from 'node:fs';
import path                  from 'node:path';
import {writeFileAtomicSync} from '../shared/atomicFileWrite.mjs';
import {
    InitializeResultSchema,
    SUPPORTED_PROTOCOL_VERSIONS
} from '@modelcontextprotocol/sdk/types.js';
import Base                        from '../../../src/core/Base.mjs';
import AiConfig                    from '../../config.mjs';
import {resolveFleetCredentialKey} from './FleetRegistryService.mjs';
import {
    normalizeAgentIdentity,
    normalizeSecureMcpEndpoint,
    parseMcpEnvelope,
    readMcpToolPayload
} from './mcpWireParsing.mjs';

// The loopback-http exception, URL-credential rejection, and canonical endpoint form live in
// ./mcpWireParsing.mjs (`normalizeSecureMcpEndpoint`) — one endpoint-boundary policy shared with
// the plane mailbox client.

/**
 * @summary The CLOSED public vocabulary for a failed connect.
 *
 * The probe is a collaborator — an injected seam in tests, and in production a function whose
 * `reason` is shaped by whatever the remote tenant returned. Echoing its text to the caller would
 * hand an untrusted party a channel into a public surface. So the outcome is derived from the one
 * field we can bound (the HTTP status) and the collaborator's prose is discarded, not sanitized:
 * an allowlist of our own sentences cannot leak what it never carries.
 * @param {Number} [status] The probe's HTTP status, when it reported one.
 * @returns {String}
 */
function rejectionReasonFor(status) {
    if (status === 401 || status === 403) return 'tenant rejected the credential';

    return Number.isInteger(status) ? `tenant MCP readiness failed (${status})` : 'tenant authentication failed';
}

/**
 * @summary Derive the two fixed remote MCP resource URLs from one canonical tenant endpoint.
 * The tenant descriptor owns only the deployment base; callers never persist or accept arbitrary
 * per-plane URLs.
 * @param {String} endpoint
 * @returns {Object} Public `{memory-core:{url}, knowledge-base:{url}}`.
 */
function resourcesFor(endpoint) {
    return {
        'memory-core'   : {url: `${endpoint}/mc/mcp`},
        'knowledge-base': {url: `${endpoint}/kb/mcp`}
    }
}

/**
 * @class Neo.ai.services.fleet.FleetTenantService
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The Brain-side (Node-only) remote-tenant connection registry — the "connect and go" half of the
 * Fleet Manager's entry story: a design partner points the cockpit at a HOSTED Agent-OS tenant
 * (a tenant URL + its provider bearer) instead of standing up the full local stack.
 *
 * **Two-hemisphere credential boundary (non-negotiable, mirroring `FleetRegistryService`):** the
 * plane bearer is a Node-side secret. It rides IN through {@link #connectTenant}, authenticates the
 * remote transport probe, and is stored reversibly encrypted (AES-256-GCM, `0600`, the same
 * `NEO_FLEET_SECRET_KEY` / generated-keyfile discipline as the agent-credential store) because the
 * remote transport must present the real bearer. It is **never** returned, never included in a
 * public descriptor, and never persists or returns through Body state — every read surface serves
 * the public projection only (`{id, endpoint, status, deploymentClass, connectedAt}`).
 *
 * Stated precisely, because the looser claim ("never transits the browser") is false and worth not
 * believing: the bearer necessarily ARRIVES through the allowlisted Body→Brain connect request. The
 * boundary this class holds is one-way — inbound once, never back out, and never into anything the
 * Body can read.
 *
 * **Fail-closed:** a malformed URL, an unreachable endpoint, or a rejected bearer never persists a
 * descriptor and never throws raw transport errors upward — the caller gets a controlled
 * `{status: 'rejected', reason}` outcome. Connecting records `deploymentClass: 'cloud-tenant'` on
 * the descriptor: the posture marker downstream isolation rules key off.
 *
 * Storage layout (under the same data-dir precedent as the registry):
 * - `tenants.json`             — public descriptors only; safe to render anywhere.
 * - `tenant-credentials.enc`   — the encrypted `{tenantId: providerBearer}` map (AES-256-GCM, `0600`).
 */
class FleetTenantService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.fleet.FleetTenantService'
         * @protected
         */
        className: 'Neo.ai.services.fleet.FleetTenantService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Optional instance-local data-root override for tenant isolation and tests. `null` resolves
     * through {@link getDataDir} to the canonical `AiConfig.fleet.dataDir` plane member, keeping
     * descriptors, credentials, and shared keys co-located with the registry.
     * @member {String|null} dataDir=null
     */
    dataDir = null
    /**
     * Transport-probe seam:
     * `({endpoint, credential, expectedIdentity?}) =>
     * Promise<{ok: Boolean, status?: Number, resources?: Object}>`.
     * Defaults (via {@link getProbeFn}) to {@link probeTenantEndpoint} — authenticated MCP
     * initialization against BOTH MC and KB. Any `reason` a stub returns is IGNORED: the public failure vocabulary is
     * derived from `status` alone ({@link rejectionReasonFor}). Inject a stub in tests so no spec
     * ever needs a live tenant or a real provider bearer. Plain field, mirroring
     * `FleetLifecycleService.spawnFn`.
     * @member {Function|null} probeFn=null
     */
    probeFn = null

    /**
     * @summary Connect a remote Agent-OS tenant: validate the URL, authenticate the transport with
     * the provider bearer, persist the descriptor (+ the encrypted credential), and return the
     * PUBLIC result.
     *
     * The returned object never carries the credential — the secret-omission boundary is the same
     * one `defineAgent` enforces for agent credentials. Reconnecting an existing endpoint updates its
     * descriptor + credential in place (re-auth is the point of a reconnect).
     * @param {Object} params
     * @param {String} params.tenantUrl  The hosted tenant's base URL. `https` required; plain `http`
     *     is accepted for loopback development only (the bearer must not cross a network in clear).
     * @param {String} params.credential The selected plane's provider bearer — stored encrypted,
     *     never returned.
     * @returns {Promise<Object>} `{id, endpoint, status: 'connected', deploymentClass,
     *     connectedAt}` on success; `{status: 'rejected', reason}` — reason drawn from a closed
     *     vocabulary — on any validation, auth, or persistence failure.
     */
    async connectTenant({tenantUrl, credential} = {}) {
        const endpoint = this.normalizeEndpoint(tenantUrl);

        if (!endpoint) {
            return {status: 'rejected', reason: 'tenantUrl must be a valid http(s) URL'};
        }

        if (typeof credential !== 'string' || credential.trim() === '') {
            return {status: 'rejected', reason: 'credential (plane provider bearer) is required'};
        }

        let probe;

        try {
            probe = await this.getProbeFn()({endpoint, credential});
        } catch (error) {
            // The probe's own failure text can carry the endpoint's internals — keep the outcome
            // bounded and endpoint-scoped; the secret never appears in any reason string.
            return {status: 'rejected', reason: 'tenant endpoint unreachable'};
        }

        if (!probe?.ok) {
            return {status: 'rejected', reason: rejectionReasonFor(probe?.status)};
        }

        const descriptor = {
            id             : this.tenantIdFor(endpoint),
            endpoint,
            status         : 'connected',
            deploymentClass: 'cloud-tenant',
            connectedAt    : new Date().toISOString()
        };

        // Mutation preflight is tri-state: absent stores are empty; existing unreadable or non-record
        // stores ABORT before either side changes. Treating corruption as `{}` here would turn a
        // connect into destructive recovery authority and silently erase older tenant state.
        let previousCredentials, previousDescriptors;

        try {
            previousCredentials = this.readCredentialsForMutation();
            previousDescriptors = this.readDescriptorsForMutation()
        } catch {
            return {status: 'rejected', reason: 'tenant connection could not be persisted'}
        }

        // Two-store connect transaction, mirroring `FleetRegistryService.defineAgent`: credential
        // FIRST, public descriptor LAST. The descriptor is the surface that claims `connected`, so
        // publishing it before the credential it depends on is what strands a tenant that reads as
        // live and cannot authenticate. Reversed, the worst case is an encrypted credential with no
        // descriptor — invisible, harmless, and overwritten by the next connect.
        let   credentialPublished = false;

        try {
            this.writeCredential(descriptor.id, credential, previousCredentials);
            credentialPublished = true;
            this.writeDescriptor(descriptor, previousDescriptors)
        } catch (error) {
            // The credential write is atomic, so a failure before it returns leaves the old snapshot
            // untouched and needs no compensating write. A descriptor failure happens after the new
            // credential landed, so only that branch restores the pre-connect snapshot. A failed
            // rollback cannot be repaired synchronously here; keep the public outcome bounded.
            if (credentialPublished) {
                try {
                    this.writeCredentials(previousCredentials)
                } catch (rollbackError) {}
            }

            return {status: 'rejected', reason: 'tenant connection could not be persisted'};
        }

        return {...descriptor};
    }

    /**
     * @summary The public tenant descriptors — safe to render on any surface; never a credential.
     * @returns {Object[]}
     */
    listTenants() {
        return Object.values(this.readDescriptors()).map(descriptor => ({
            id             : descriptor.id,
            endpoint       : descriptor.endpoint,
            status         : descriptor.status,
            deploymentClass: descriptor.deploymentClass,
            connectedAt    : descriptor.connectedAt
        }))
    }

    /**
     * @summary Resolve a connected tenant into the fixed, non-secret MC/KB resource descriptor used
     * by workspace generation. Brain-internal: no wire method exposes it. Missing, disconnected, or
     * malformed rows fail closed to `null`.
     * @param {String} tenantId
     * @returns {Object|null} `{tenantId, endpoint, resources}` with no credential.
     */
    resolveMcpResources(tenantId) {
        const
            descriptor = this.readDescriptors()[tenantId],
            endpoint   = this.normalizeEndpoint(descriptor?.endpoint);

        if (!descriptor ||
            descriptor.id !== tenantId ||
            descriptor.status !== 'connected' ||
            !endpoint ||
            endpoint !== descriptor.endpoint) {
            return null
        }

        return {
            tenantId,
            endpoint,
            resources: resourcesFor(endpoint)
        }
    }

    /**
     * @summary Resolve the selected tenant's encrypted provider bearer for the remote MC/KB child-env
     * slot. Brain-internal only: this method is not wire-allowlisted and returns a value only while
     * the matching public descriptor is still canonical and connected.
     * @param {String} tenantId
     * @returns {String|null}
     */
    resolveMcpCredential(tenantId) {
        if (!this.resolveMcpResources(tenantId)) return null;

        const credential = this.getCredential(tenantId);

        return typeof credential === 'string' && credential.trim() ? credential : null
    }

    /**
     * @summary Authenticate the selected tenant's provider credential against BOTH selected tenant
     * resources before any checkout or config mutation. Repository and plane credentials are
     * intentionally resolved by different services: a GitHub checkout PAT is not remote-plane
     * authority, even when one deployment happens to use GitHub as its identity provider.
     * @param {Object} options
     * @param {String} options.tenantId
     * @param {String} options.credential Plane credential resolved once from this tenant service.
     * @param {String} options.expectedIdentity Canonical seat identity the provider credential must
     *     resolve to. A valid credential for a different provider subject fails closed.
     * @returns {Promise<Object>} Bounded `{ok,status,resources}`; never remote prose or a token.
     */
    async probeSeatCredential({tenantId, credential, expectedIdentity}={}) {
        const
            resolved          = this.resolveMcpResources(tenantId),
            canonicalIdentity = normalizeAgentIdentity(expectedIdentity);

        if (!resolved ||
            typeof credential !== 'string' ||
            !credential.trim() ||
            !canonicalIdentity) {
            return {ok: false}
        }

        try {
            const readiness = await this.getProbeFn()({
                endpoint        : resolved.endpoint,
                credential,
                expectedIdentity: canonicalIdentity
            });

            if (readiness?.resources?.['memory-core']?.identity !== canonicalIdentity) {
                return {...readiness, ok: false}
            }

            return readiness
        } catch {
            return {ok: false}
        }
    }

    /**
     * @summary Resolve one tenant's stored provider bearer for the Node-side transport that presents it.
     * Brain-internal only: this method is NOT on any wire allowlist and must never be added to one.
     * @param {String} tenantId
     * @returns {String|null}
     * @protected
     */
    getCredential(tenantId) {
        const map = this.readCredentials();

        return map[tenantId] ?? null;
    }

    /**
     * @summary Normalizes + validates the tenant URL: http/https only, no credentials-in-URL, and a
     * canonical origin+path form (no trailing slash) so one endpoint maps to one tenant id.
     * @param {*} tenantUrl
     * @returns {String|null}
     * @protected
     */
    normalizeEndpoint(tenantUrl) {
        // The provider bearer rides to this endpoint as a header (see `probeTenantEndpoint`), so the
        // endpoint's scheme decides whether the credential crosses the wire in cleartext — the shared
        // boundary policy enforces TLS-off-loopback and rejects URL-embedded secrets outright.
        return normalizeSecureMcpEndpoint(tenantUrl);
    }

    /**
     * @summary Stable tenant id from the endpoint: host plus a short endpoint digest — readable in
     * a roster row, collision-safe across paths on one host.
     * @param {String} endpoint
     * @returns {String}
     * @protected
     */
    tenantIdFor(endpoint) {
        const digest = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 8);

        return `${new URL(endpoint).host}-${digest}`;
    }

    // ---- storage (public descriptors + encrypted credentials) ---------------

    /**
     * @summary Resolve the Fleet-owned durable root from the explicit instance/test override or
     * the canonical `AiConfig.fleet.dataDir` plane member. Both Fleet storage owners therefore
     * consume the same config coordinate without env re-derivation or service-local defaults.
     * @returns {String}
     * @protected
     */
    getDataDir() {
        return this.dataDir || AiConfig.fleet.dataDir;
    }

    /**
     * @returns {Function} the transport probe (injected stub or {@link probeTenantEndpoint}).
     * @protected
     */
    getProbeFn() {
        return this.probeFn || probeTenantEndpoint;
    }

    /**
     * @returns {Object} `{tenantId: descriptor}` from `tenants.json`; `{}` when absent/corrupt (fail-closed read).
     * @protected
     */
    readDescriptors() {
        try {
            return this.readDescriptorsForMutation()
        } catch {
            return {};
        }
    }

    /**
     * @summary Strict mutation snapshot for `tenants.json`: missing is an empty record; an existing
     * unreadable, null, scalar, or array payload throws so a connect cannot overwrite it.
     * @returns {Object} Null-prototype descriptor record.
     * @protected
     */
    readDescriptorsForMutation() {
        const file = path.join(this.getDataDir(), 'tenants.json');
        let   source;

        try {
            source = fs.readFileSync(file, 'utf8')
        } catch (error) {
            if (error?.code === 'ENOENT') return Object.create(null);

            throw error
        }

        const parsed = JSON.parse(source);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new TypeError('FleetTenantService: tenants.json must contain a descriptor record.')
        }

        return Object.assign(Object.create(null), parsed)
    }

    /**
     * @summary Upserts one public descriptor, published atomically; `0600` like every fleet store file.
     * @param {Object} descriptor
     * @param {Object} [snapshot] Strict preflight snapshot.
     * @protected
     */
    writeDescriptor(descriptor, snapshot=this.readDescriptorsForMutation()) {
        const map = Object.assign(Object.create(null), snapshot);

        map[descriptor.id] = descriptor;

        this.publishAtomically(
            path.join(this.getDataDir(), 'tenants.json'),
            JSON.stringify(map, null, 4)
        );
    }

    /**
     * @summary Write-then-rename, the `FleetRegistryService.writeRegistry` precedent.
     *
     * `writeFileSync` onto a live path truncates before it writes: a crash mid-write leaves a
     * half-file that the fail-closed readers here would silently parse as an EMPTY store — every
     * tenant descriptor or credential gone, indistinguishable from a fresh install. A rename is
     * atomic on POSIX, so a reader sees either the whole prior file or the whole new one.
     * @param {String} file
     * @param {String|Buffer} contents
     * @protected
     */
    publishAtomically(file, contents) {
        // This site was already correct — pid+UUID scratch, 0o600, cleanup on throw. It is one of the
        // two exemplars the owned primitive was modelled on; the call replaces the copy, not the care.
        writeFileAtomicSync(file, contents)
    }

    /**
     * @returns {Object} the decrypted `{tenantId: providerBearer}` map; `{}` when absent/locked/corrupt — the
     * fail-closed read discipline of the agent-credential store.
     * @protected
     */
    readCredentials() {
        try {
            return this.readCredentialsForMutation()
        } catch {
            return {};
        }
    }

    /**
     * @summary Strict mutation snapshot for the encrypted credential record. Missing is empty;
     * existing unreadable/wrong-key/non-record ciphertext throws and must remain byte-identical.
     * @returns {Object} Null-prototype credential record.
     * @protected
     */
    readCredentialsForMutation() {
        const file = path.join(this.getDataDir(), 'tenant-credentials.enc');
        let   raw;

        try {
            raw = fs.readFileSync(file)
        } catch (error) {
            if (error?.code === 'ENOENT') return Object.create(null);

            throw error
        }

        const parsed = JSON.parse(this.decrypt(raw));

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new TypeError('FleetTenantService: tenant-credentials.enc must contain a credential record.')
        }

        return Object.assign(Object.create(null), parsed)
    }

    /**
     * @summary Upserts one encrypted credential; the map is re-encrypted whole (AES-256-GCM, `0600`).
     * @param {String} tenantId
     * @param {String} credential
     * @param {Object} [snapshot] Strict preflight snapshot.
     * @protected
     */
    writeCredential(tenantId, credential, snapshot=this.readCredentialsForMutation()) {
        const map = Object.assign(Object.create(null), snapshot);

        map[tenantId] = credential;

        this.writeCredentials(map);
    }

    /**
     * @summary Encrypt + atomically publish the WHOLE credential map — the rollback seam.
     *
     * Separate from {@link writeCredential} because a rollback must restore a prior snapshot
     * wholesale, not upsert one entry: re-adding the key we just wrote is not the inverse of
     * writing it.
     * @param {Object} map `{tenantId: providerBearer}`
     * @protected
     */
    writeCredentials(map) {
        this.publishAtomically(
            path.join(this.getDataDir(), 'tenant-credentials.enc'),
            this.encrypt(JSON.stringify(map))
        );
    }

    // ---- crypto (AES-256-GCM, the FleetRegistryService discipline) ----------

    /**
     * @param {String} plaintext
     * @returns {Buffer} `iv(12) | authTag(16) | ciphertext`
     * @protected
     */
    encrypt(plaintext) {
        const iv     = crypto.randomBytes(12),
              cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv),
              enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

        return Buffer.concat([iv, cipher.getAuthTag(), enc]);
    }

    /**
     * @param {Buffer} payload `iv(12) | authTag(16) | ciphertext`
     * @returns {String}
     * @protected
     */
    decrypt(payload) {
        const iv       = payload.subarray(0, 12),
              tag      = payload.subarray(12, 28),
              data     = payload.subarray(28),
              decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), iv);

        decipher.setAuthTag(tag);

        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    }

    /**
     * @summary Resolve the 32-byte AES key: `NEO_FLEET_SECRET_KEY` (hex or base64) if set, else the
     * generated `fleet.key` dev file — the SAME key source as the agent-credential store, so one
     * operator secret governs both reversible credential classes.
     * @returns {Buffer}
     * @protected
     */
    getKey() {
        return resolveFleetCredentialKey({
            dataDir    : this.getDataDir(),
            serviceName: 'FleetTenantService'
        })
    }
}

// normalizeAgentIdentity / parseMcpEnvelope / readMcpToolPayload live in ./mcpWireParsing.mjs —
// the fleet subsystem's one MCP-wire parsing authority, shared with planeMailboxClient.

/**
 * @summary Ask Memory Core for the request-bound caller identity inside the initialized session.
 * `list_permissions` is read-only, health-exempt, defaults to the bound caller, and returns the
 * canonical identity it actually used. A valid bearer for the wrong provider subject therefore
 * cannot pass this gate.
 * @param {Object} options
 * @param {String} options.url
 * @param {String} options.credential
 * @param {String} options.sessionId
 * @param {String} options.protocolVersion Negotiated initialize response version.
 * @param {String} options.expectedIdentity
 * @returns {Promise<Object>} Bounded `{ok,status,identity}`.
 * @private
 */
async function probeMcpIdentity({url, credential, sessionId, protocolVersion, expectedIdentity}) {
    const response = await fetch(url, {
        method : 'POST',
        headers: {
            Accept                : 'application/json, text/event-stream',
            Authorization         : `Bearer ${credential}`,
            'Content-Type'        : 'application/json',
            'mcp-protocol-version': protocolVersion,
            'mcp-session-id'      : sessionId
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id     : 2,
            method : 'tools/call',
            params : {name: 'list_permissions', arguments: {}}
        }),
        signal: AbortSignal.timeout(AiConfig.fleet.tenantProbeTimeoutMs)
    });
    const payload  = readMcpToolPayload(parseMcpEnvelope(await response.text()));
    const identity = normalizeAgentIdentity(payload?.identity);
    const matches  = response.ok && identity === expectedIdentity;

    return {
        ok      : matches,
        status  : response.status,
        identity: matches ? expectedIdentity : null
    }
}

/**
 * @summary Complete the MCP initialize handshake with the negotiated version before any tool call.
 * A server may accept `initialize` yet correctly reject calls until this notification arrives.
 * @param {Object} options
 * @param {String} options.url
 * @param {String} options.credential
 * @param {String|null} options.sessionId
 * @param {String} options.protocolVersion Negotiated initialize response version.
 * @returns {Promise<Object>} Bounded `{ok,status}`.
 * @private
 */
async function notifyMcpInitialized({url, credential, sessionId, protocolVersion}) {
    const headers = {
        Accept                : 'application/json, text/event-stream',
        Authorization         : `Bearer ${credential}`,
        'Content-Type'        : 'application/json',
        'mcp-protocol-version': protocolVersion
    };

    if (sessionId) headers['mcp-session-id'] = sessionId;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body  : JSON.stringify({
            jsonrpc: '2.0',
            method : 'notifications/initialized'
        }),
        signal: AbortSignal.timeout(AiConfig.fleet.tenantProbeTimeoutMs)
    });

    await response.text();

    return {ok: response.ok, status: response.status}
}

/**
 * @summary Probe one MCP resource with the protocol's authenticated `initialize` request. A plain
 * health endpoint can stay green while auth or one plane is broken, so readiness is established at
 * the same route and protocol the generated seat will consume.
 * @param {Object} options
 * @param {String} options.url
 * @param {String} options.credential
 * @param {String|null} [options.expectedIdentity] Memory Core caller identity to prove.
 * @returns {Promise<Object>} `{ok,status,identity?}` with no remote prose.
 */
async function initializeMcpResource({url, credential, expectedIdentity=null}) {
    const requestedProtocolVersion = '2024-11-05';
    const headers                  = {
        Accept        : 'application/json, text/event-stream',
        Authorization : `Bearer ${credential}`,
        'Content-Type': 'application/json'
    };
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body  : JSON.stringify({
            jsonrpc: '2.0',
            id     : 1,
            method : 'initialize',
            params : {
                protocolVersion: requestedProtocolVersion,
                capabilities   : {},
                clientInfo     : {name: 'neo-fleet-readiness', version: '1'}
            }
        }),
        signal: AbortSignal.timeout(AiConfig.fleet.tenantProbeTimeoutMs)
    });

    const sessionId = response.headers.get('mcp-session-id');
    let   protocolVersion;

    try {
        // Consume + validate the exact InitializeResult shape so a mismatched JSON-RPC response,
        // reverse-proxy payload, or arbitrary canned result cannot masquerade as MCP readiness.
        // The remote text never crosses into a public reason.
        const
            envelope     = parseMcpEnvelope(await response.text()),
            parsedResult = InitializeResultSchema.safeParse(envelope?.result),
            result       = parsedResult.success ? parsedResult.data : null;

        protocolVersion = result?.protocolVersion;

        const initialized = response.ok &&
            envelope?.jsonrpc === '2.0' &&
            envelope?.id === 1 &&
            result &&
            SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion);

        let observation = {ok: !!initialized, status: response.status};

        if (observation.ok) {
            const notification = await notifyMcpInitialized({
                url,
                credential,
                sessionId,
                protocolVersion
            });

            observation = {
                ok    : notification.ok,
                status: notification.ok ? response.status : notification.status
            }
        }

        if (observation.ok && expectedIdentity) {
            observation = sessionId
                ? await probeMcpIdentity({url, credential, sessionId, protocolVersion, expectedIdentity})
                : {ok: false, status: response.status, identity: null}
        }

        return observation
    } finally {
        if (sessionId) {
            try {
                const closeResponse = await fetch(url, {
                    method : 'DELETE',
                    headers: {
                        ...headers,
                        'mcp-protocol-version': protocolVersion || requestedProtocolVersion,
                        'mcp-session-id'      : sessionId
                    },
                    signal : AbortSignal.timeout(2_000)
                });

                await closeResponse.text()
            } catch {
                // Readiness failed or was already established. Cleanup remains bounded best effort.
            }
        }
    }
}

/**
 * @summary The default tenant probe: authenticate and initialize BOTH fixed MC and KB MCP routes in
 * parallel. Both must be ready; the aggregate exposes per-plane bounded observations for capture
 * evidence while never carrying response text.
 *
 * Reports `{ok, status, resources}` and deliberately NO prose. The caller owns the public failure vocabulary
 * ({@link rejectionReasonFor}) because a probe's text is shaped by the remote tenant; a `reason`
 * field here would be an open invitation for the next author to forward it, which is the boundary
 * this split exists to close.
 * @param {Object} options
 * @param {String} options.endpoint   Normalized tenant base URL (TLS, or loopback for development).
 * @param {String} options.credential The tenant bearer (used for the probe only; never logged).
 * @param {String|null} [options.expectedIdentity] Canonical seat identity to verify through MC.
 * @returns {Promise<Object>} `{ok, status, resources}`.
 */
export async function probeTenantEndpoint({endpoint, credential, expectedIdentity=null}) {
    const resources = resourcesFor(endpoint);
    const entries   = await Promise.all(Object.entries(resources).map(async ([key, {url}]) => {
        try {
            return [key, await initializeMcpResource({
                url,
                credential,
                expectedIdentity: key === 'memory-core' ? expectedIdentity : null
            })]
        } catch {
            return [key, {ok: false}]
        }
    }));
    const observations = Object.fromEntries(entries);
    const failed       = entries.find(([, observation]) => !observation.ok)?.[1];

    return {
        ok       : !failed,
        status   : failed?.status ?? 200,
        resources: observations
    };
}

export default Neo.setupClass(FleetTenantService);
