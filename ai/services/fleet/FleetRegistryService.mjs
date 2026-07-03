import crypto          from 'crypto';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import aiConfig        from '../../config.mjs';
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
 * An **agent definition** is `{id, githubUsername, harnessType, modelProvider, metadata, createdAt, updatedAt}` —
 * never a secret. `modelProvider` (the agent's model-provider login) resolves via the AiConfig
 * `modelProvider` SSOT leaf when not supplied — read-only, no service-local default shadow. The associated **credential** (a GitHub PAT) is stored separately, encrypted at
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
 * ({@link mintBridgeToken}) — a registry-minted, short-lived, **asymmetrically-signed** credential
 * for agent↔Neural-Link-Bridge transport auth. It is stateless (nothing persisted): an Ed25519
 * signature over `{agentId, expiresAt}` that the network-facing Bridge verifies with only the
 * **public** key ({@link getBridgePublicKey}) — so a Bridge compromise can neither read the PAT
 * store nor forge a token. The private signing key ({@link getSigningKey}) never decrypts the PAT
 * store; the two credential classes stay key-separated.
 *
 * **Storage** lives under `dataDir` (default `<repoRoot>/.neo-ai-data/fleet/`, overridable — the
 * per-tenant data root is the multi-tenant isolation seam):
 * - `registry.json`    — agent definitions (no secrets), human-readable JSON.
 * - `credentials.enc`  — the encrypted `{agentId: pat}` map (AES-256-GCM, `0600`).
 * - `fleet.key`        — dev-only generated `0600` AES key file, used when `NEO_FLEET_SECRET_KEY`
 *                        is not set. Production deployments SHOULD provide the env key.
 * - `signing.key`      — dev-only generated `0600` Ed25519 signing key (PKCS8 PEM), used when
 *                        `NEO_FLEET_SIGNING_KEY` is not set. Only its PUBLIC half goes to the Bridge.
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
     * @param {String} [opts.modelProvider]     The agent's model-provider login (e.g. `openAiCompatible`, `ollama`). Resolves via the AiConfig `modelProvider` SSOT leaf when omitted — no service-local default shadow. Non-secret; carried in the public definition.
     * @returns {Object} The public agent definition (no credential).
     */
    defineAgent({githubUsername, harnessType, credential, id, metadata={}, modelProvider} = {}) {
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
                // provider-login resolves via the AiConfig SSOT leaf when unset (no service-local
                // default shadow); an explicit arg wins, else a prior value is preserved on update.
                modelProvider : modelProvider || existing?.modelProvider || aiConfig.modelProvider,
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
     * Partially update an existing agent definition: merge `metadata` (does NOT replace it) and
     * override `modelProvider` if given, preserving every other field, `createdAt`, and the stored
     * credential. The narrow patch path distinct from {@link defineAgent}'s full create-or-replace
     * upsert — control verbs (e.g. `FleetManager.setRepo`) mutate one facet without re-supplying the
     * whole definition (which would demand `githubUsername`/`harnessType` and wipe unspecified
     * metadata). Non-destructive to on-disk checkout and credential. No-op-safe: an unknown id
     * returns `null` rather than creating a partial definition.
     * @param {String}  id
     * @param {Object}  patch
     * @param {Object} [patch.metadata]      Metadata keys merged into the existing metadata.
     * @param {String} [patch.modelProvider] New model-provider login.
     * @returns {Object|null} The updated public definition, or `null` when the agent doesn't exist.
     */
    updateAgent(id, {metadata, modelProvider} = {}) {
        this.ensureLoaded();

        const existing = this.agents.get(id);
        if (!existing) return null;

        const def = {
            ...existing,
            metadata     : metadata ? {...existing.metadata, ...metadata} : existing.metadata,
            modelProvider: modelProvider || existing.modelProvider,
            updatedAt    : new Date().toISOString()
        };

        this.agents.set(id, def);
        this.writeRegistry();

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
        // The PAT dies with the agent. The Bridge token is a stateless *signed* credential (no
        // store), so it can't be revoked at remove-time — it self-expires within bridgeTokenTtlMs
        // (the accepted ≤1h lag; immediate eviction of a compromised agent is a later additive
        // Bridge revocation-denylist). WriteGuard's no-clobber invariant denies
        // an overlapping cross-agent write on the agentId regardless of token age in the interim.
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

    /**
     * @summary Mint a short-lived, **asymmetrically-signed** Bridge session token for
     * agent↔Neural-Link-Bridge transport auth. The token is a self-contained, stateless credential:
     * a compact `<base64url(payload)>.<base64url(signature)>` where `payload` is
     * `{agentId, expiresAt}` and the signature is Ed25519 over those exact payload bytes
     * ({@link getSigningKey}). Nothing is persisted — there is no per-token store.
     *
     * **Why signed, not hash-stored (the recorded ticket decision):** the Bridge runs as a separate,
     * network-facing process. A store-read verifier would have to hold the registry's master key
     * (the same `getKey()` that decrypts `credentials.enc` = every PAT), so a Bridge compromise would
     * leak all PATs. An asymmetric signature lets the Bridge verify statelessly with only the
     * **public** key ({@link getBridgePublicKey}) — zero secret material + zero store access on the
     * exposed surface, and it cannot forge tokens. The cost is a ≤`bridgeTokenTtlMs` revocation lag
     * (a removed agent's token stays valid until expiry); accepted because WriteGuard's no-clobber
     * invariant denies an overlapping cross-agent write on the `agentId` regardless of token age.
     * Immediate eviction of a *compromised* agent is a later additive Bridge revocation-denylist.
     *
     * The verified `agentId` rides **inside** the signed payload — so the Bridge trusts identity from
     * the signature, never the connection's `?id=` query claim (the spoofing hole this closes).
     * @param {String}  id          The agent id the token is minted for (signed into the payload).
     * @param {Object} [opts]
     * @param {Number} [opts.ttlMs] Token lifetime in ms; defaults to {@link bridgeTokenTtlMs}.
     * @returns {Object} `{token, expiresAt}` — the signed token (caller keeps it; nothing persisted) + its epoch-ms expiry.
     */
    mintBridgeToken(id, {ttlMs}={}) {
        const
            now       = Date.now(),
            expiresAt = now + (ttlMs ?? this.bridgeTokenTtlMs),
            payload   = Buffer.from(JSON.stringify({agentId: id, expiresAt})),
            signature = crypto.sign(null, payload, this.getSigningKey()),
            token     = `${payload.toString('base64url')}.${signature.toString('base64url')}`;

        return {token, expiresAt};
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

    /**
     * Resolve the Ed25519 **private** signing key for Bridge session tokens: `NEO_FLEET_SIGNING_KEY`
     * (a PKCS8 PEM) if set, else a generated `0600` `signing.key` file under `dataDir`. Distinct from
     * {@link getKey} (the AES master key) — this private key never decrypts the PAT/token stores, and
     * only its PUBLIC half ({@link getBridgePublicKey}) is provisioned to the network-facing Bridge.
     * Production SHOULD set the env key. Returns a {@link crypto.KeyObject}.
     * @returns {Object}
     * @private
     */
    getSigningKey() {
        const envKey = process.env.NEO_FLEET_SIGNING_KEY;
        if (envKey) return crypto.createPrivateKey(envKey);

        const file = this.signingKeyPath();
        if (fs.existsSync(file)) return crypto.createPrivateKey(fs.readFileSync(file, 'utf8'));

        this.ensureDataDir();
        const {privateKey} = crypto.generateKeyPairSync('ed25519');
        fs.writeFileSync(file, privateKey.export({type: 'pkcs8', format: 'pem'}), {mode: 0o600});
        return privateKey;
    }

    /**
     * @returns {String} The Ed25519 **public** verify key (SPKI PEM) matching {@link getSigningKey}.
     * Non-secret — this is the only key material the network-facing Bridge needs to verify token
     * signatures statelessly. Provisioned to the Bridge at startup via `NEO_FLEET_BRIDGE_PUBLIC_KEY`,
     * a trusted harness/operator-set value — **never** supplied by a connecting agent.
     * @private
     */
    getBridgePublicKey() {
        return crypto.createPublicKey(this.getSigningKey()).export({type: 'spki', format: 'pem'});
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

    /** @returns {String} The Ed25519 signing-key file (PKCS8 PEM) — a generated `0600` dev key when
     * `NEO_FLEET_SIGNING_KEY` is unset. Distinct from {@link keyPath} (the AES master key). @private */
    signingKeyPath() { return path.join(this.getDataDir(), 'signing.key'); }

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
