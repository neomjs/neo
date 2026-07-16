import crypto          from 'node:crypto';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Base            from '../../../src/core/Base.mjs';

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
 * public descriptor, and never transits the browser — every read surface serves the public
 * projection only (`{id, endpoint, status, deploymentClass, connectedAt}`).
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
     * Transport-probe seam: `({endpoint, credential}) => Promise<{ok: Boolean, status?: Number,
     * reason?: String}>`. Defaults (via {@link getProbeFn}) to {@link probeTenantEndpoint} — an
     * authenticated HTTPS health probe. Inject a stub in tests so no spec ever needs a live tenant
     * or a real PAT. Plain field, mirroring `FleetLifecycleService.spawnFn`.
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
     * @param {String} params.tenantUrl  The hosted tenant's base URL (http/https).
     * @param {String} params.credential The tenant PAT — stored encrypted, never returned.
     * @returns {Promise<Object>} `{id, endpoint, status: 'connected', deploymentClass,
     *     connectedAt}` on success; `{status: 'rejected', reason}` on any validation/auth failure.
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
            return {status: 'rejected', reason: probe?.reason || 'tenant authentication failed'};
        }

        const descriptor = {
            id             : this.tenantIdFor(endpoint),
            endpoint,
            status         : 'connected',
            deploymentClass: 'cloud-tenant',
            connectedAt    : new Date().toISOString()
        };

        this.writeDescriptor(descriptor);
        this.writeCredential(descriptor.id, credential);

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

        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        // A URL-embedded secret would bypass the encrypted store — reject the shape outright.
        if (url.username || url.password) return null;

        return (url.origin + url.pathname).replace(/\/+$/, '');
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
     * @summary Resolve (field > env > default) the fleet data directory — the registry precedent.
     * @returns {String}
     * @protected
     */
    getDataDir() {
        return this.dataDir || process.env.NEO_FLEET_DATA_DIR || path.resolve(
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
     * @summary Upserts one public descriptor; `0600` like every fleet store file.
     * @param {Object} descriptor
     * @protected
     */
    writeDescriptor(descriptor) {
        const dir  = this.getDataDir(),
              file = path.join(dir, 'tenants.json'),
              map  = this.readDescriptors();

        map[descriptor.id] = descriptor;

        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(file, JSON.stringify(map, null, 4), {encoding: 'utf8', mode: 0o600});
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
        const dir = this.getDataDir(),
              map = this.readCredentials();

        map[tenantId] = credential;

        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, 'tenant-credentials.enc'), this.encrypt(JSON.stringify(map)), {mode: 0o600});
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
 * path, bearer-presented, bounded timeout. Any 2xx authenticates; 401/403 is a named auth
 * rejection; everything else is unreachable.
 * @param {Object} options
 * @param {String} options.endpoint   Normalized tenant base URL.
 * @param {String} options.credential The tenant PAT (used for the probe only; never logged).
 * @returns {Promise<Object>} `{ok}` plus, when available, `status` and a bounded `reason`.
 */
export async function probeTenantEndpoint({endpoint, credential}) {
    const response = await fetch(`${endpoint}/health`, {
        headers: {Authorization: `Bearer ${credential}`},
        signal : AbortSignal.timeout(10_000)
    });

    if (response.ok) return {ok: true, status: response.status};

    return {
        ok    : false,
        status: response.status,
        reason: response.status === 401 || response.status === 403
            ? 'tenant rejected the credential'
            : `tenant health probe failed (${response.status})`
    };
}

export default Neo.setupClass(FleetTenantService);
