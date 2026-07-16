import crypto          from 'node:crypto';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Base            from '../../../src/core/Base.mjs';

/**
 * Hosts for which plain `http:` is accepted. Deliberately an exact set rather than a range or a
 * pattern: this is the one exception to the TLS rule that protects the bearer, so it stays small
 * enough to audit at a glance. A developer running a tenant on a non-loopback address uses TLS.
 *
 * `[::1]` keeps its brackets: these are compared against `URL#hostname`, which returns the IPv6
 * literal bracketed. Un-bracketing it here would silently stop matching.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * @summary Canonical origin+path form (no trailing slash) so one endpoint maps to one tenant id.
 * @param {URL} url
 * @returns {String}
 */
function canonicalize(url) {
    return (url.origin + url.pathname).replace(/\/+$/, '');
}

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

    return Number.isInteger(status) ? `tenant health probe failed (${status})` : 'tenant authentication failed';
}

/**
 * @class Neo.ai.services.fleet.FleetTenantService
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The Brain-side (Node-only) remote-tenant connection registry — the "connect and go" half of the
 * Fleet Manager's entry story: a design partner points the cockpit at a HOSTED Agent-OS tenant
 * (a tenant URL + a PAT) instead of standing up the full local stack.
 *
 * **Two-hemisphere credential boundary (non-negotiable, mirroring `FleetRegistryService`):** the
 * tenant PAT is a Node-side secret. It rides IN through {@link #connectTenant}, authenticates the
 * remote transport probe, and is stored reversibly encrypted (AES-256-GCM, `0600`, the same
 * `NEO_FLEET_SECRET_KEY` / generated-keyfile discipline as the agent-PAT store) because the future
 * remote transport must present the real bearer. It is **never** returned, never included in a
 * public descriptor, and never persists or returns through Body state — every read surface serves
 * the public projection only (`{id, endpoint, status, deploymentClass, connectedAt}`).
 *
 * Stated precisely, because the looser claim ("never transits the browser") is false and worth not
 * believing: the PAT necessarily ARRIVES through the allowlisted Body→Brain connect request. The
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
 * - `tenant-credentials.enc`   — the encrypted `{tenantId: pat}` map (AES-256-GCM, `0600`).
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
     * Absolute data directory for the tenant stores. `null` ⇒ resolved via {@link getDataDir}
     * (`NEO_FLEET_DATA_DIR` env, then the registry-precedent `.neo-ai-data/fleet` default). Plain
     * field, mirroring the sibling services' tunables.
     * @member {String|null} dataDir=null
     */
    dataDir = null
    /**
     * Transport-probe seam: `({endpoint, credential}) => Promise<{ok: Boolean, status?: Number}>`.
     * Defaults (via {@link getProbeFn}) to {@link probeTenantEndpoint} — an authenticated HTTPS
     * health probe. Any `reason` a stub returns is IGNORED: the public failure vocabulary is
     * derived from `status` alone ({@link rejectionReasonFor}). Inject a stub in tests so no spec
     * ever needs a live tenant or a real PAT. Plain field, mirroring `FleetLifecycleService.spawnFn`.
     * @member {Function|null} probeFn=null
     */
    probeFn = null

    /**
     * @summary Connect a remote Agent-OS tenant: validate the URL, authenticate the transport with
     * the PAT, persist the descriptor (+ the encrypted credential), and return the PUBLIC result.
     *
     * The returned object never carries the credential — the secret-omission boundary is the same
     * one `defineAgent` enforces for agent PATs. Reconnecting an existing endpoint updates its
     * descriptor + credential in place (re-auth is the point of a reconnect).
     * @param {Object} params
     * @param {String} params.tenantUrl  The hosted tenant's base URL. `https` required; plain `http`
     *     is accepted for loopback development only (the bearer must not cross a network in clear).
     * @param {String} params.credential The tenant PAT — stored encrypted, never returned.
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
            return {status: 'rejected', reason: 'credential (tenant PAT) is required'};
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

        // Two-store connect transaction, mirroring `FleetRegistryService.defineAgent`: credential
        // FIRST, public descriptor LAST. The descriptor is the surface that claims `connected`, so
        // publishing it before the credential it depends on is what strands a tenant that reads as
        // live and cannot authenticate. Reversed, the worst case is an encrypted credential with no
        // descriptor — invisible, harmless, and overwritten by the next connect.
        const previousCredentials = this.readCredentials();
        let   credentialPublished = false;

        try {
            this.writeCredential(descriptor.id, credential);
            credentialPublished = true;
            this.writeDescriptor(descriptor)
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
        return Object.values(this.readDescriptors()).map(descriptor => ({...descriptor}));
    }

    /**
     * @summary Resolve one tenant's stored PAT for the Node-side transport that must present it.
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
        if (typeof tenantUrl !== 'string' || tenantUrl.trim() === '') return null;

        let url;

        try {
            url = new URL(tenantUrl.trim());
        } catch {
            return null;
        }

        // A URL-embedded secret would bypass the encrypted store — reject the shape outright.
        if (url.username || url.password) return null;

        // The PAT rides to this endpoint as a bearer header (see `probeTenantEndpoint`), so the
        // endpoint's scheme decides whether the credential crosses the wire in cleartext. TLS is
        // required for anything remote; `http:` survives only for loopback, where there is no
        // network hop to intercept and a developer can run a tenant without a certificate.
        if (url.protocol === 'https:') return canonicalize(url);

        if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return canonicalize(url);

        return null;
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
     * @summary Resolve (field > default) the fleet data directory — the registry precedent, exactly.
     *
     * No env layer: `FleetRegistryService.getDataDir()` resolves field-then-default, and these two
     * services share this directory. A private env override on one side could point the tenant
     * store at a different root than the agent store while both claim the same home.
     * @returns {String}
     * @protected
     */
    getDataDir() {
        return this.dataDir || path.resolve(
            path.dirname(fileURLToPath(import.meta.url)), '../../../.neo-ai-data/fleet'
        );
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
            return JSON.parse(fs.readFileSync(path.join(this.getDataDir(), 'tenants.json'), 'utf8'));
        } catch {
            return {};
        }
    }

    /**
     * @summary Upserts one public descriptor, published atomically; `0600` like every fleet store file.
     * @param {Object} descriptor
     * @protected
     */
    writeDescriptor(descriptor) {
        const map = this.readDescriptors();

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
        const dir     = path.dirname(file),
              tmpFile = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;

        fs.mkdirSync(dir, {recursive: true});

        try {
            fs.writeFileSync(tmpFile, contents, {mode: 0o600});
            fs.renameSync(tmpFile, file)
        } catch (error) {
            if (fs.existsSync(tmpFile)) {
                fs.unlinkSync(tmpFile)
            }

            throw error
        }
    }

    /**
     * @returns {Object} the decrypted `{tenantId: pat}` map; `{}` when absent/locked/corrupt — the
     * fail-closed read discipline of the agent-credential store.
     * @protected
     */
    readCredentials() {
        try {
            const raw = fs.readFileSync(path.join(this.getDataDir(), 'tenant-credentials.enc'));

            return JSON.parse(this.decrypt(raw));
        } catch {
            return {};
        }
    }

    /**
     * @summary Upserts one encrypted credential; the map is re-encrypted whole (AES-256-GCM, `0600`).
     * @param {String} tenantId
     * @param {String} credential
     * @protected
     */
    writeCredential(tenantId, credential) {
        const map = this.readCredentials();

        map[tenantId] = credential;

        this.writeCredentials(map);
    }

    /**
     * @summary Encrypt + atomically publish the WHOLE credential map — the rollback seam.
     *
     * Separate from {@link writeCredential} because a rollback must restore a prior snapshot
     * wholesale, not upsert one entry: re-adding the key we just wrote is not the inverse of
     * writing it.
     * @param {Object} map `{tenantId: pat}`
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
        const envKey = process.env.NEO_FLEET_SECRET_KEY;

        if (envKey) {
            const buffer = /^[0-9a-f]{64}$/i.test(envKey) ? Buffer.from(envKey, 'hex') : Buffer.from(envKey, 'base64');

            if (buffer.length !== 32) {
                throw new Error('FleetTenantService: NEO_FLEET_SECRET_KEY must decode to 32 bytes (AES-256).');
            }

            return buffer;
        }

        const keyFile = path.join(this.getDataDir(), 'fleet.key');

        try {
            const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');

            if (key.length === 32) return key;
        } catch {
            // fall through to generation
        }

        const key = crypto.randomBytes(32);

        fs.mkdirSync(this.getDataDir(), {recursive: true});
        fs.writeFileSync(keyFile, key.toString('hex'), {encoding: 'utf8', mode: 0o600});

        return key;
    }
}

/**
 * @summary The default transport probe: an authenticated GET against the tenant endpoint's health
 * path, bearer-presented, bounded timeout. Any 2xx authenticates; everything else does not.
 *
 * Reports `{ok, status}` and deliberately NO prose. The caller owns the public failure vocabulary
 * ({@link rejectionReasonFor}) because a probe's text is shaped by the remote tenant; a `reason`
 * field here would be an open invitation for the next author to forward it, which is the boundary
 * this split exists to close.
 * @param {Object} options
 * @param {String} options.endpoint   Normalized tenant base URL (TLS, or loopback for development).
 * @param {String} options.credential The tenant PAT (used for the probe only; never logged).
 * @returns {Promise<Object>} `{ok, status}`.
 */
export async function probeTenantEndpoint({endpoint, credential}) {
    const response = await fetch(`${endpoint}/health`, {
        headers: {Authorization: `Bearer ${credential}`},
        signal : AbortSignal.timeout(10_000)
    });

    return {ok: response.ok, status: response.status};
}

export default Neo.setupClass(FleetTenantService);
