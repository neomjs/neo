import crypto          from 'crypto';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../../src/core/Base.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename);

/**
 * @class Neo.ai.services.fleet.FleetRegistryService
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The Brain-side (Node-only) registry of Fleet Manager agent definitions and their credentials.
 * This is the first leaf of the Fleet Manager MVP: the `define` surface of the operator loop
 * *define agents → start/stop → repos managed under the hood*.
 *
 * An **agent definition** is `{id, githubUsername, harnessType, metadata, createdAt, updatedAt}` —
 * never a secret. The associated **credential** (a GitHub PAT) is stored separately, encrypted at
 * rest, and is the load-bearing security boundary of this service:
 *
 * **Two-hemisphere security rule** (the graduated Agent Harness design rule): the PAT is a
 * Node-side secret. It is written *in* via {@link defineAgent}, stored encrypted, and
 * is **never** returned by the public read API ({@link getAgent} / {@link listAgents}). Only the
 * dedicated Brain-internal {@link resolveCredential} accessor decrypts it — for the instance spawner
 * (a later FM leaf) — so the Body-side settings pane can never read a PAT back.
 *
 * **Two credential classes, deliberately separated at the store + method level:** (1) the
 * GitHub **PAT** above — *reversibly* encrypted, because the spawner must inject the real token into
 * a harness env; served only by {@link resolveCredential}. (2) the **Bridge session token**
 * ({@link mintBridgeToken} / {@link verifyBridgeToken}) — a registry-minted, short-lived,
 * **hash-stored, verify-only** credential for agent↔Neural-Link-Bridge transport auth. It
 * lives in its own store (`bridgeTokens.enc`) with its own read/write methods and **never** routes
 * through the PAT helpers — so "encrypted at rest" can never quietly become a second *reversible*
 * secret store. The raw Bridge token is absent from storage the instant {@link mintBridgeToken}
 * returns; only its SHA-256 hash + expiry persist.
 *
 * **Storage** lives under `dataDir` (default `<repoRoot>/.neo-ai-data/fleet/`, overridable — the
 * per-tenant data root is the multi-tenant isolation seam):
 * - `registry.json`    — agent definitions (no secrets), human-readable JSON.
 * - `credentials.enc`  — the encrypted `{agentId: pat}` map (AES-256-GCM, `0600`).
 * - `bridgeTokens.enc` — the encrypted `{agentId: {hash, expiresAt, createdAt}}` Bridge-token map
 *                        (AES-256-GCM, `0600`) — the second, distinct credential class; no raw token.
 * - `fleet.key`        — dev-only generated `0600` key file, used when `NEO_FLEET_SECRET_KEY` is
 *                        not set. Production deployments SHOULD provide the env key.
 *
 * **Fail-closed:** an absent / locked / corrupt credential store never throws into the define/list
 * path and never surfaces plaintext — {@link resolveCredential} returns `null`.
 */
class FleetRegistryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.fleet.FleetRegistryService'
         * @protected
         */
        className: 'Neo.ai.services.fleet.FleetRegistryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String|null} dataDir_=null
         * @summary Absolute path to the fleet data directory. Defaults to
         * `<repoRoot>/.neo-ai-data/fleet/`. Set a per-tenant path for isolation, or a temp path in
         * tests. Changing it transparently reloads the in-memory registry on the next call.
         */
        dataDir_: null
    }

    /**
     * Whitelist of supported harness types an agent definition may declare.
     * @member {String[]} harnessTypes
     * @protected
     */
    harnessTypes = ['claude-desktop', 'codex', 'antigravity', 'native-neo']

    /**
     * Default lifetime of a minted Bridge session token, in milliseconds (1h). Short-lived by
     * design — rotation falls out of expiry. Overridable per call via `mintBridgeToken(id, {ttlMs})`.
     * @member {Number} bridgeTokenTtlMs=3600000
     * @protected
     */
    bridgeTokenTtlMs = 60 * 60 * 1000

    /**
     * In-memory cache of agent definitions (no secrets), keyed by agent id.
     * @member {Map<String,Object>} agents
     * @private
     */
    agents = new Map()

    /**
     * The resolved `dataDir` the in-memory `agents` cache was last loaded from; guards transparent
     * reloads when `dataDir` changes (e.g. across tests / tenants).
     * @member {String|null} loadedDir=null
     * @private
     */
    loadedDir = null

    // ---- public API ---------------------------------------------------------

    /**
     * Define (create or update) an agent and, optionally, store its credential.
     * @param {Object}  opts
     * @param {String}  opts.githubUsername     The agent's GitHub username (required).
     * @param {String}  opts.harnessType        One of {@link harnessTypes} (required).
     * @param {String} [opts.credential]        The GitHub PAT — stored Node-side encrypted; never echoed back.
     * @param {String} [opts.id=githubUsername] Stable id; pass an explicit id to register multiple instances per user.
     * @param {Object} [opts.metadata={}]       Free-form non-secret metadata.
     * @returns {Object} The public agent definition (no credential).
     */
    defineAgent({githubUsername, harnessType, credential, id, metadata={}} = {}) {
        if (!githubUsername) throw new Error("FleetRegistryService.defineAgent: 'githubUsername' is required.");
        if (!harnessType)    throw new Error("FleetRegistryService.defineAgent: 'harnessType' is required.");

        if (!this.harnessTypes.includes(harnessType)) {
            throw new Error(`FleetRegistryService.defineAgent: invalid harnessType '${harnessType}'. Must be one of: ${this.harnessTypes.join(', ')}.`);
        }

        this.ensureLoaded();

        const
            agentId  = id || githubUsername,
            now      = new Date().toISOString(),
            existing = this.agents.get(agentId),
            def      = {
                id            : agentId,
                githubUsername,
                harnessType,
                metadata,
                createdAt     : existing?.createdAt || now,
                updatedAt     : now
            };

        this.agents.set(agentId, def);
        this.writeRegistry();

        if (credential != null) {
            this.storeCredential(agentId, credential);
        }

        return this.toPublic(def);
    }

    /**
     * List all agent definitions (no credentials).
     * @returns {Object[]}
     */
    listAgents() {
        this.ensureLoaded();
        return [...this.agents.values()].map(def => this.toPublic(def));
    }

    /**
     * Get a single agent definition (no credential).
     * @param {String} id
     * @returns {Object|null}
     */
    getAgent(id) {
        this.ensureLoaded();
        const def = this.agents.get(id);
        return def ? this.toPublic(def) : null;
    }

    /**
     * Remove an agent definition and its stored credential.
     * @param {String} id
     * @returns {Object} `{success, id}`
     */
    removeAgent(id) {
        this.ensureLoaded();
        const existed = this.agents.delete(id);
        if (existed) this.writeRegistry();
        // Both credential classes die with the agent — the PAT AND the Bridge token. Leaving a live
        // Bridge token for a removed agent would let it keep authenticating to the Bridge.
        this.removeCredential(id);
        this.removeBridgeToken(id);
        return {success: existed, id};
    }

    /**
     * Brain-internal credential accessor — the ONLY path that returns a raw PAT. Intended for the
     * instance spawner (a later FM leaf), never the Body-side settings pane. Fails closed.
     * @param {String} id
     * @returns {String|null} The decrypted PAT, or `null` if absent / unreadable.
     */
    resolveCredential(id) {
        const credentials = this.readCredentials();
        // own-property lookup only: an id like `toString` / `constructor` must fail closed to null,
        // never resolve to an inherited Object.prototype member.
        return Object.hasOwn(credentials, id) ? credentials[id] : null;
    }

    /**
     * @summary Mint a short-lived, hash-stored Bridge session token for agent↔Neural-Link-Bridge
     * transport auth. The raw token is returned **once** to the caller and is **never**
     * persisted — only its SHA-256 hash + expiry land in `bridgeTokens.enc`, a store distinct from
     * the reversibly-encrypted PAT (the Bridge token can never route through the PAT helpers). A
     * re-mint for the same id replaces the prior record.
     *
     * Minting does **not** require `id` to be a registered agent (it only produces + stores a hash) —
     * the validity boundary is {@link verifyBridgeToken}, which fails closed unless `id` is a current
     * fleet member. So a token minted for a non-member never authenticates; binding the check at
     * verify (not mint) keeps the gate in one place and tolerates a register-after-mint ordering.
     * @param {String}  id          The agent id the token is minted for.
     * @param {Object} [opts]
     * @param {Number} [opts.ttlMs] Token lifetime in ms; defaults to {@link bridgeTokenTtlMs}.
     * @returns {Object} `{token, expiresAt}` — the raw token (caller keeps it; absent from storage) + its epoch-ms expiry.
     */
    mintBridgeToken(id, {ttlMs}={}) {
        const
            token     = crypto.randomBytes(32).toString('base64url'),
            hash      = crypto.createHash('sha256').update(token).digest('hex'),
            now       = Date.now(),
            expiresAt = now + (ttlMs ?? this.bridgeTokenTtlMs),
            tokens    = this.readBridgeTokens();

        tokens[id] = {hash, expiresAt, createdAt: now};
        this.writeBridgeTokens(tokens);

        return {token, expiresAt};
    }

    /**
     * @summary Verify a presented Bridge token against the hash-stored record for `id`. This is the
     * untrusted-input path: a **constant-time** hash compare ({@link crypto.timingSafeEqual}) that
     * rejects expired tokens and **fails closed** — returns `false` (never throws) on an id that is
     * not a currently-registered agent (never registered, or removed via {@link removeAgent}), an
     * unknown / absent / unreadable / malformed store, a bad hash encoding, or a missing / expired
     * `expiresAt`. Mirrors {@link resolveCredential}'s fail-closed posture; no secret ever surfaces.
     *
     * **The Bridge token authenticates a *current fleet member*** — validity is bound to registry
     * membership, so a removed agent's token can never authenticate (the security invariant the
     * `removeAgent` → `removeBridgeToken` cleanup and this gate jointly guarantee).
     * @param {String} id        The agent id presenting the token.
     * @param {String} presented The raw token to check.
     * @returns {Boolean} `true` only for a live, matching token owned by a registered agent; `false` otherwise.
     */
    verifyBridgeToken(id, presented) {
        try {
            // Bind validity to fleet membership: a never-registered or removed id fails closed even
            // if a token record lingers (defense-in-depth over the removeAgent cleanup). `Map.has`
            // is prototype-safe for untrusted ids.
            this.ensureLoaded();
            if (!this.agents.has(id)) return false;

            const tokens = this.readBridgeTokens();
            // own-property only: an untrusted id like `toString` must fail closed, never alias a proto member.
            if (!Object.hasOwn(tokens, id)) return false;

            const record = tokens[id];
            if (!record || typeof record.expiresAt !== 'number' || Date.now() >= record.expiresAt) {
                return false;
            }

            const
                presentedHash = crypto.createHash('sha256').update(presented).digest(),
                storedHash    = Buffer.from(String(record.hash), 'hex');

            // timingSafeEqual throws on a length mismatch; a malformed/short stored hash fails closed.
            return storedHash.length === presentedHash.length && crypto.timingSafeEqual(presentedHash, storedHash);
        } catch (error) {
            console.warn('[FleetRegistryService] Bridge-token verify failed closed.', error.message);
            return false;
        }
    }

    // ---- internals ----------------------------------------------------------

    /**
     * @param {Object} def
     * @returns {Object} A defensive copy of the definition, guaranteed to carry no secret.
     * @private
     */
    toPublic(def) {
        const {credential, pat, ...rest} = def;
        return {...rest};
    }

    /**
     * Lazily (re)load the in-memory registry from disk when `dataDir` changes.
     * @private
     */
    ensureLoaded() {
        const dir = this.getDataDir();
        if (this.loadedDir === dir) return;
        this.agents    = this.readRegistry();
        this.loadedDir = dir;
    }

    /**
     * @returns {Map<String,Object>} Agent definitions read from `registry.json` (empty on miss/corrupt).
     * @private
     */
    readRegistry() {
        const file = this.registryPath();
        if (!fs.existsSync(file)) return new Map();
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            return new Map(Object.entries(data.agents || {}));
        } catch (error) {
            console.warn(`[FleetRegistryService] Unreadable registry at ${file}; starting empty.`, error.message);
            return new Map();
        }
    }

    /**
     * Persist the in-memory registry to `registry.json` (no secrets).
     * @private
     */
    writeRegistry() {
        this.ensureDataDir();
        const payload = {agents: Object.fromEntries(this.agents)};
        fs.writeFileSync(this.registryPath(), JSON.stringify(payload, null, 2), 'utf8');
    }

    /**
     * @returns {Object} The decrypted `{agentId: pat}` map as a **null-prototype** object (empty +
     * warned on absent/corrupt — fail-closed). Null-prototype is the security invariant: credential
     * ids are untrusted keys, so an absent id can never alias an inherited `Object.prototype` member
     * (`toString` / `constructor` / `__proto__` …) on lookup, store, or remove.
     * @private
     */
    readCredentials() {
        const file = this.credentialsPath();
        if (!fs.existsSync(file)) return Object.create(null);
        try {
            return Object.assign(Object.create(null), JSON.parse(this.decrypt(fs.readFileSync(file, 'utf8'))));
        } catch (error) {
            console.warn('[FleetRegistryService] Credential store unreadable; failing closed.', error.message);
            return Object.create(null);
        }
    }

    /**
     * Encrypt + persist a single credential, merged into the existing store.
     * @param {String} id
     * @param {String} pat
     * @private
     */
    storeCredential(id, pat) {
        const map = this.readCredentials();
        map[id] = pat;
        this.writeCredentials(map);
    }

    /**
     * Remove a single credential from the store (no-op if absent).
     * @param {String} id
     * @private
     */
    removeCredential(id) {
        const map = this.readCredentials();
        if (Object.hasOwn(map, id)) {
            delete map[id];
            this.writeCredentials(map);
        }
    }

    /**
     * Encrypt + write the full credential map to `credentials.enc` (`0600`).
     * @param {Object} map
     * @private
     */
    writeCredentials(map) {
        this.ensureDataDir();
        fs.writeFileSync(this.credentialsPath(), this.encrypt(JSON.stringify(map)), {mode: 0o600});
    }

    /**
     * @returns {Object} The decrypted Bridge-token store as a **null-prototype** map
     * `{agentId: {hash, expiresAt, createdAt}}` (empty + warned on absent/corrupt — fail-closed).
     * A distinct file + shape from {@link readCredentials}; the two stores never mix. Null-proto is
     * the same untrusted-key invariant — an absent id can never alias an `Object.prototype` member.
     * @private
     */
    readBridgeTokens() {
        const file = this.bridgeTokensPath();
        if (!fs.existsSync(file)) return Object.create(null);
        try {
            return Object.assign(Object.create(null), JSON.parse(this.decrypt(fs.readFileSync(file, 'utf8'))));
        } catch (error) {
            console.warn('[FleetRegistryService] Bridge-token store unreadable; failing closed.', error.message);
            return Object.create(null);
        }
    }

    /**
     * Encrypt + write the full Bridge-token map to `bridgeTokens.enc` (`0600`). Encryption is
     * defense-in-depth *over* the stored SHA-256 hashes — the records carry no reversible secret;
     * it is never a license to persist a raw token. Distinct file/method from {@link writeCredentials}.
     * @param {Object} map
     * @private
     */
    writeBridgeTokens(map) {
        this.ensureDataDir();
        fs.writeFileSync(this.bridgeTokensPath(), this.encrypt(JSON.stringify(map)), {mode: 0o600});
    }

    /**
     * Remove a single Bridge-token record from the store (no-op if absent). Invoked by
     * {@link removeAgent} so the Bridge credential dies with the agent — the analog of
     * {@link removeCredential} for the second credential class.
     * @param {String} id
     * @private
     */
    removeBridgeToken(id) {
        const tokens = this.readBridgeTokens();
        if (Object.hasOwn(tokens, id)) {
            delete tokens[id];
            this.writeBridgeTokens(tokens);
        }
    }

    // ---- crypto (AES-256-GCM) ----------------------------------------------

    /**
     * @param {String} plaintext
     * @returns {String} base64( iv(12) ‖ authTag(16) ‖ ciphertext )
     * @private
     */
    encrypt(plaintext) {
        const
            iv     = crypto.randomBytes(12),
            cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv),
            enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]),
            tag    = cipher.getAuthTag();
        return Buffer.concat([iv, tag, enc]).toString('base64');
    }

    /**
     * @param {String} payload base64( iv(12) ‖ authTag(16) ‖ ciphertext )
     * @returns {String} plaintext
     * @private
     */
    decrypt(payload) {
        const
            raw      = Buffer.from(payload, 'base64'),
            iv       = raw.subarray(0, 12),
            tag      = raw.subarray(12, 28),
            data     = raw.subarray(28),
            decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    }

    /**
     * Resolve the 32-byte AES key: `NEO_FLEET_SECRET_KEY` (hex or base64) if set, else a generated
     * `0600` dev key file under `dataDir`. Production SHOULD set the env key.
     * @returns {Buffer}
     * @private
     */
    getKey() {
        const envKey = process.env.NEO_FLEET_SECRET_KEY;
        if (envKey) {
            const buf = Buffer.from(envKey, /^[0-9a-fA-F]{64}$/.test(envKey) ? 'hex' : 'base64');
            if (buf.length !== 32) {
                throw new Error('FleetRegistryService: NEO_FLEET_SECRET_KEY must decode to 32 bytes (AES-256).');
            }
            return buf;
        }
        const file = this.keyPath();
        if (fs.existsSync(file)) return fs.readFileSync(file);
        this.ensureDataDir();
        const key = crypto.randomBytes(32);
        fs.writeFileSync(file, key, {mode: 0o600});
        return key;
    }

    // ---- paths --------------------------------------------------------------

    /**
     * @returns {String} The resolved fleet data directory.
     * @private
     */
    getDataDir() {
        return this.dataDir || path.resolve(__dirname, '../../../.neo-ai-data/fleet');
    }

    /** @returns {String} @private */
    registryPath() { return path.join(this.getDataDir(), 'registry.json'); }

    /** @returns {String} @private */
    credentialsPath() { return path.join(this.getDataDir(), 'credentials.enc'); }

    /** @returns {String} A store distinct from {@link credentialsPath}; the two never share a file. @private */
    bridgeTokensPath() { return path.join(this.getDataDir(), 'bridgeTokens.enc'); }

    /** @returns {String} @private */
    keyPath() { return path.join(this.getDataDir(), 'fleet.key'); }

    /**
     * Ensure the data directory exists.
     * @private
     */
    ensureDataDir() {
        fs.mkdirSync(this.getDataDir(), {recursive: true});
    }
}

export default Neo.setupClass(FleetRegistryService);
