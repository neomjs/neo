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
 * **Storage** lives under `dataDir` (default `<repoRoot>/.neo-ai-data/fleet/`, overridable — the
 * per-tenant data root is the multi-tenant isolation seam):
 * - `registry.json`   — agent definitions (no secrets), human-readable JSON.
 * - `credentials.enc` — the encrypted `{agentId: pat}` map (AES-256-GCM, `0600`).
 * - `fleet.key`       — dev-only generated `0600` key file, used when `NEO_FLEET_SECRET_KEY` is
 *                       not set. Production deployments SHOULD provide the env key.
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
        this.removeCredential(id);
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
