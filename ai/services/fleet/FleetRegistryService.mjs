import crypto                from 'crypto';
import fs                    from 'fs';
import path                  from 'path';
import aiConfig              from '../../config.mjs';
import Base                  from '../../../src/core/Base.mjs';
import {HARNESS_TYPES}       from './harnessTypes.mjs';
import {writeFileAtomicSync} from '../shared/atomicFileWrite.mjs';
import {
    normalizeMcpOverrides,
    normalizeMcpTarget,
    supportsTenantMcpTarget
} from './mcpServers.mjs';

const
    RETIRED_TARGET_FIELD    = ['mcp', 'Transport'].join(''),
    PUBLIC_SENSITIVE_KEY_RE = /^(?:credentials?|secrets?|tokens?|(?:github)?pats?|passwords?|authorization|(?:api|client|private)(?:key|token|secret|credential|password)s?|personalaccess(?:key|token|secret|credential|password)s?|(?:access|auth|bearer|github|id|oauth|refresh|session)(?:key|token|secret|credential|password)s?|launch|command|args|argv|env|environment)$/;

/**
 * @summary Resolve the one AES-256 key shared by Fleet's repository-credential and remote-plane
 * credential stores. The canonical on-disk encoding is 32 raw bytes. The earlier tenant store wrote
 * the same logical key as 64 ASCII hex bytes; that legacy form is decoded and atomically migrated
 * in place so existing ciphertext remains decryptable. Any other existing shape fails loud and is
 * never overwritten.
 *
 * Creation is race-safe: `wx` elects one writer, and losers read + validate the winner. Migration
 * uses a `0600` temporary sibling followed by atomic rename; concurrent legacy migrations publish
 * the same decoded key.
 *
 * @param {Object} options
 * @param {String} options.dataDir Absolute Fleet data directory.
 * @param {Object} [options.env=process.env] Environment authority.
 * @param {String} [options.serviceName='Fleet credential store'] Error-message owner.
 * @returns {Buffer} Exactly 32 key bytes.
 */
export function resolveFleetCredentialKey({
    dataDir,
    env         = process.env,
    serviceName = 'Fleet credential store'
} = {}) {
    const envKey = env.NEO_FLEET_SECRET_KEY;

    if (envKey) {
        const key = Buffer.from(envKey, /^[0-9a-fA-F]{64}$/.test(envKey) ? 'hex' : 'base64');

        if (key.length !== 32) {
            throw new Error(`${serviceName}: NEO_FLEET_SECRET_KEY must decode to 32 bytes (AES-256).`)
        }

        return key
    }

    if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) {
        throw new Error(`${serviceName}: dataDir must be an absolute path.`)
    }

    const
        keyFile         = path.join(dataDir, 'fleet.key'),
        readExistingKey = () => {
            const raw = fs.readFileSync(keyFile);

            if (raw.length === 32) return raw;

            const legacyHex = raw.toString('ascii');

            if (raw.length === 64 && /^[0-9a-fA-F]{64}$/.test(legacyHex)) {
                const key = Buffer.from(legacyHex, 'hex');

                // Binary payload: `encoding: null` so the key is written as bytes, not re-encoded.
                writeFileAtomicSync(keyFile, key, {encoding: null});

                return key
            }

            throw new Error(
                `${serviceName}: fleet.key must contain exactly 32 raw bytes or legacy 64-character hex.`
            )
        };

    try {
        return readExistingKey()
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error
    }

    fs.mkdirSync(dataDir, {recursive: true});

    const key = crypto.randomBytes(32);

    try {
        fs.writeFileSync(keyFile, key, {flag: 'wx', mode: 0o600});
        return key
    } catch (error) {
        if (error?.code !== 'EEXIST') throw error;

        return readExistingKey()
    }
}

/**
 * @summary Returns whether a normalized public-definition key carries credential or launch
 * authority. Anchoring is deliberate: `refreshToken` and `client_secret` are denied, while benign
 * descriptive fields such as `credentialState`, `tokenBudget`, and `commandLabel` survive.
 * @param {String} key
 * @returns {Boolean}
 */
function isPublicSensitiveKey(key) {
    const normalized = key.replaceAll('-', '').replaceAll('_', '').toLowerCase();

    return PUBLIC_SENSITIVE_KEY_RE.test(normalized)
}

/**
 * @summary Recursively remove credential/launch vocabulary from a caller-owned public projection.
 * Registry metadata is intentionally extensible, so redaction must guard nested legacy entries as
 * well as the current top-level fields. Keys normalize hyphens/underscores and case before lookup.
 * @param {*} value Structured-cloned public value.
 * @param {WeakSet<Object>} [seen]
 * @returns {*} The same redacted value.
 */
function redactPublicFields(value, seen=new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) {
        return value
    }

    seen.add(value);

    Object.keys(value).forEach(key => {
        if (isPublicSensitiveKey(key)) {
            delete value[key]
        } else {
            redactPublicFields(value[key], seen)
        }
    });

    return value
}

/**
 * @summary Canonicalize one persisted target without letting a corrupt row acquire tenant
 * authority. Absence and invalid stored shapes both fail closed to the resident target.
 * @param {*} target
 * @returns {Object|null}
 */
function normalizeStoredMcpTarget(target) {
    try {
        return normalizeMcpTarget(target ?? null)
    } catch {
        return null
    }
}

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
 * An **agent definition** is `{id, githubUsername, harnessType, modelProvider, mcpServers,
 * mcpTarget, metadata, createdAt, updatedAt}` —
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
 * **Storage** lives under `dataDir` (the canonical `AiConfig.fleet.dataDir` plane member, with an
 * explicit instance/test override seam — the per-tenant data root is the multi-tenant isolation
 * seam):
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
         * @summary Optional instance-local Fleet data-root override for isolation and tests.
         * Production leaves this null so {@link getDataDir} reads the canonical
         * `AiConfig.fleet.dataDir` plane member at the use site. Changing it transparently reloads
         * the in-memory registry on the next call.
         */
        dataDir_: null
    }

    /**
     * Whitelist of supported harness types an agent definition may declare — derived from the ONE
     * harness-type authority (`./harnessTypes.mjs`, app twin lint-bound): adding a harness there updates
     * this validation set AND every Body picker/label in the same registration.
     * @member {String[]} harnessTypes
     * @protected
     */
    harnessTypes = HARNESS_TYPES.map(entry => entry.type)

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
     * Create an agent and, optionally, store its credential. Existing ids reject: every edit of an
     * established resident must use a scoped authority (`configureAgent`, `setRepo`, `setAvatar`,
     * or the Brain-only launch override), never replay this credential-bearing creation surface.
     * @param {Object}  opts
     * @param {String}  opts.githubUsername     The agent's GitHub username (required).
     * @param {String}  opts.harnessType        One of {@link harnessTypes} (required).
     * @param {String} [opts.credential]        The GitHub PAT — stored Node-side encrypted; never echoed back.
     * @param {String} [opts.id=githubUsername] Stable id; pass an explicit id to register multiple instances per user.
     * @param {Object} [opts.metadata={}]       Free-form non-secret metadata.
     * @param {String} [opts.modelProvider]     The agent's model-provider login (e.g. `openAiCompatible`, `ollama`). Resolves via the AiConfig `modelProvider` SSOT leaf when omitted — no service-local default shadow. Non-secret; carried in the public definition.
     * @param {Object|null} [opts.mcpServers]   Sparse MCP overrides shared with configureAgent; omitted/null follows defaults.
     * @param {Object|null} [opts.mcpTarget] Resident (`null` / `{kind:'resident'}`) or
     *     `{kind:'tenant', tenantId}`. No transport, URL, header, env, command, or credential bag.
     * @returns {Object} The public agent definition (no credential).
     */
    defineAgent(options={}) {
        if (Object.hasOwn(options || {}, RETIRED_TARGET_FIELD)) {
            throw new TypeError(
                "FleetRegistryService.defineAgent: retired target-as-transport input is not accepted; use 'mcpTarget'."
            )
        }

        const {
            githubUsername,
            harnessType,
            credential,
            id,
            metadata={},
            modelProvider,
            mcpServers,
            mcpTarget
        } = options || {};

        if (!githubUsername) throw new Error("FleetRegistryService.defineAgent: 'githubUsername' is required.");
        if (!harnessType)    throw new Error("FleetRegistryService.defineAgent: 'harnessType' is required.");

        if (!this.harnessTypes.includes(harnessType)) {
            throw new Error(`FleetRegistryService.defineAgent: invalid harnessType '${harnessType}'. Must be one of: ${this.harnessTypes.join(', ')}.`);
        }

        // SECURITY STOP-LINE (mechanical): `metadata.launch` is executed with Brain credentials by
        // the lifecycle service, and `defineAgent` is a wire-allowlisted verb — accepting a launch
        // payload here would make remote code execution with credentials a Body-reachable normal
        // form. Rejected at the storage boundary, never stripped silently: the Brain/operator-only
        // write path is {@link setLaunchOverride}, which no bridge and no wire allowlist exposes.
        if (metadata && Object.hasOwn(metadata, 'launch')) {
            throw new Error("FleetRegistryService.defineAgent: 'metadata.launch' is not definable through this surface — wire callers send curated harnessType intent only. Brain/operator launch overrides go through setLaunchOverride.");
        }

        const
            agentId = id || githubUsername,
            now     = new Date().toISOString(),
            matrix  = mcpServers === undefined ? null : normalizeMcpOverrides(mcpServers),
            target  = mcpTarget === undefined ? null : normalizeMcpTarget(mcpTarget);

        if (target && !supportsTenantMcpTarget(harnessType)) {
            throw new TypeError(`FleetRegistryService.defineAgent: harnessType '${harnessType}' does not support tenant MCP targets.`)
        }

        this.ensureLoaded();

        if (this.agents.has(agentId)) {
            throw new Error(`FleetRegistryService.defineAgent: id '${agentId}' already exists; use a scoped update operation.`)
        }

        const tenantAssignee = target && this.findMcpTenantAssignee(target.tenantId);

        if (tenantAssignee) {
            throw new Error(`FleetRegistryService.defineAgent: MCP tenant '${target.tenantId}' is already assigned to agent '${tenantAssignee}'.`)
        }

        const previousCredentials = this.readCredentials();

        // A process crash or failed rollback can leave a credential without its registry row.
        // Credentialless creation MUST NOT silently adopt that orphan for a later caller. An
        // explicit credential-bearing retry is the recovery authority: it overwrites the orphan
        // before the public row publishes.
        if (credential == null && Object.hasOwn(previousCredentials, agentId)) {
            throw new Error(`FleetRegistryService.defineAgent: orphan credential exists for id '${agentId}'; credentialless creation refused. Retry with an explicit credential.`)
        }

        const
            def        = {
                id            : agentId,
                githubUsername,
                harnessType,
                // provider-login resolves via the AiConfig SSOT leaf when unset (no service-local
                // default shadow); an explicit arg wins on creation.
                modelProvider: modelProvider || aiConfig.modelProvider,
                metadata,
                mcpServers   : matrix,
                mcpTarget    : target,
                createdAt    : now,
                updatedAt    : now
            },
            nextAgents = new Map(this.agents);

        nextAgents.set(agentId, def);

        if (credential != null) {
            const nextCredentials = Object.assign(Object.create(null), previousCredentials, {[agentId]: credential});

            // Two-store create transaction: credential first, registry row last. A credential
            // failure cannot strand an unrecoverable create-only resident. If registry publish
            // fails, restore the prior credential snapshot. If rollback itself fails or the
            // process dies between files, the orphan guard above refuses credentialless adoption;
            // an explicit credential-bearing retry remains recoverable.
            this.writeCredentials(nextCredentials);

            try {
                this.writeRegistry(nextAgents)
            } catch (error) {
                try {
                    this.writeCredentials(previousCredentials)
                } catch (rollbackError) {}

                throw error
            }
        } else {
            this.writeRegistry(nextAgents)
        }

        this.agents = nextAgents;
        return this.toPublic(def);
    }

    /**
     * Partially update an existing agent definition: merge `metadata` (does NOT replace it) and
     * override `modelProvider` if given, preserving every other field, `createdAt`, and the stored
     * credential. This narrow patch path is distinct from {@link defineAgent}'s create-only
     * boundary — control verbs (e.g. `FleetManager.setRepo`) mutate one facet without replaying
     * identity or credentials. Non-destructive to on-disk checkout and credential. No-op-safe: an
     * unknown id returns `null` rather than creating a partial definition.
     * @param {String}  id
     * @param {Object}  patch
     * @param {Object} [patch.metadata]      Metadata keys merged into the existing metadata.
     * @param {String} [patch.modelProvider] New model-provider login.
     * @returns {Object|null} The updated public definition, or `null` when the agent doesn't exist.
     */
    updateAgent(id, {metadata, modelProvider} = {}) {
        // The same mechanical stop-line as {@link defineAgent}: scoped wire verbs (`setRepo`,
        // `setAvatar`) patch metadata through here, so the launch key is equally unwritable on the
        // patch path. Brain/operator launch overrides go through {@link setLaunchOverride}.
        if (metadata && Object.hasOwn(metadata, 'launch')) {
            throw new Error("FleetRegistryService.updateAgent: 'metadata.launch' is not patchable through this surface. Brain/operator launch overrides go through setLaunchOverride.");
        }

        this.ensureLoaded();

        const existing = this.agents.get(id);
        if (!existing) return null;

        const def = {
            ...existing,
            metadata     : metadata ? {...existing.metadata, ...metadata} : existing.metadata,
            modelProvider: modelProvider || existing.modelProvider,
            updatedAt    : new Date().toISOString()
        };

        const nextAgents = new Map(this.agents);
        nextAgents.set(id, def);
        this.writeRegistry(nextAgents);
        this.agents = nextAgents;

        return this.toPublic(def);
    }

    /**
     * Configure an existing agent through the ONE wire-serializable curated intent. Only `id`,
     * `harnessType`, sparse `mcpServers` overrides, and the narrow `mcpTarget` intent are accepted;
     * credentials, URLs, headers, launch fields, wake, hooks, identity, and generic config bags are
     * mechanically rejected. Unspecified fields are preserved. The returned public definition is canonical persisted readback, never request
     * echo. Controlled validation failures use the method prefix so FleetControlBridge can expose a
     * safe rejected-domain reason while unexpected storage failures remain transport-sanitized.
     * @param {Object} intent
     * @param {String} intent.id Existing registry id.
     * @param {String} [intent.harnessType] Registered durable harness key.
     * @param {Object|null} [intent.mcpServers] Complete sparse MCP override set; null follows defaults.
     * @param {Object|null} [intent.mcpTarget] `null`/resident or `{kind:'tenant', tenantId}`.
     * @returns {Object|null} Updated public definition, or `null` when the id is not registered.
     */
    configureAgent(intent={}) {
        const reject = reason => {
            throw new TypeError(`FleetRegistryService.configureAgent: ${reason}`)
        };

        if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
            reject('intent must be an object.')
        }

        const
            allowed                                  = new Set(['id', 'harnessType', 'mcpServers', 'mcpTarget']),
            unknown                                  = Object.keys(intent).find(key => !allowed.has(key)),
            {id, harnessType, mcpServers, mcpTarget} = intent;

        if (unknown) {
            reject(`unsupported field '${unknown}'.`)
        }
        if (typeof id !== 'string' || !id.trim()) {
            reject("'id' is required.")
        }
        if (!Object.hasOwn(intent, 'harnessType') &&
            !Object.hasOwn(intent, 'mcpServers') &&
            !Object.hasOwn(intent, 'mcpTarget')) {
            reject('at least one configuration field is required.')
        }

        this.ensureLoaded();

        const existing = this.agents.get(id);
        if (!existing) return null;

        if (Object.hasOwn(intent, 'harnessType') && !this.harnessTypes.includes(harnessType)) {
            reject(`invalid harnessType '${harnessType}'. Must be one of: ${this.harnessTypes.join(', ')}.`)
        }

        let
            matrix = existing.mcpServers ?? null,
            target = normalizeStoredMcpTarget(existing.mcpTarget);

        if (Object.hasOwn(intent, 'mcpServers')) {
            try {
                matrix = normalizeMcpOverrides(mcpServers)
            } catch (error) {
                reject(error.message)
            }
        }

        if (Object.hasOwn(intent, 'mcpTarget')) {
            try {
                target = normalizeMcpTarget(mcpTarget)
            } catch (error) {
                reject(error.message)
            }
        }

        const nextHarnessType = Object.hasOwn(intent, 'harnessType') ? harnessType : existing.harnessType;

        if (target && !supportsTenantMcpTarget(nextHarnessType)) {
            reject(`harnessType '${nextHarnessType}' does not support tenant MCP targets.`)
        }

        const tenantAssignee = target && this.findMcpTenantAssignee(target.tenantId, id);

        if (tenantAssignee) {
            reject(`MCP tenant '${target.tenantId}' is already assigned to agent '${tenantAssignee}'.`)
        }

        const def = {
            ...existing,
            harnessType: nextHarnessType,
            mcpServers : matrix,
            mcpTarget  : target,
            updatedAt  : new Date().toISOString()
        };

        const nextAgents = new Map(this.agents);
        nextAgents.set(id, def);
        this.writeRegistry(nextAgents);
        this.agents = nextAgents;

        return this.toPublic(def);
    }

    /**
     * @summary The Brain/operator-only write path for a raw launch override — the compatibility
     * escape hatch the wire can never reach: this method exists on the registry only (no
     * `FleetControlBridge` member, no `FLEET_WIRE_METHODS` entry — the dispatch allowlist spec pins
     * that), so a launch payload can only be authored by Brain-side code or an operator process.
     * The lifecycle service executes a stored `metadata.launch` with Brain credentials, which is
     * exactly why {@link defineAgent} / {@link updateAgent} reject it: whatever can author THIS is
     * trusted with arbitrary-command execution already. `null` clears the override (the agent falls
     * back to its curated family template).
     * @param {String}      id     Registry agent id.
     * @param {Object|null} launch `{command, args, env}` — validated for shape by the lifecycle
     *                             service at resolve time; `null` removes the override.
     * @returns {Object|null} The updated RAW definition (Brain-facing, launch visible — the public
     *                        projection redacts launch, so it could not confirm this write), or
     *                        `null` when the agent doesn't exist.
     */
    setLaunchOverride(id, launch) {
        this.ensureLoaded();

        const existing = this.agents.get(id);
        if (!existing) return null;

        const metadata = {...existing.metadata};
        if (launch == null) {
            delete metadata.launch;
        } else {
            metadata.launch = launch;
        }

        const def = {...existing, metadata, updatedAt: new Date().toISOString()};

        this.agents.set(id, def);
        this.writeRegistry();

        return this.getDefinition(id);
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
     * @summary Brain-internal raw definition read — the ONLY read surface that carries
     * `metadata.launch`. Same authority posture as {@link setLaunchOverride}: registry-only method,
     * no `FleetControlBridge` member, no `FLEET_WIRE_METHODS` entry (the dispatch allowlist spec
     * pins that); the lifecycle spawn path is its consumer. Returns a deep clone (minus secrets) so
     * no caller can mutate the registry cache through the result.
     * @param {String} id
     * @returns {Object|null}
     */
    getDefinition(id) {
        this.ensureLoaded();

        const def = this.agents.get(id);
        if (!def) return null;

        const {credential, pat, ...rest} = def;
        return structuredClone({...rest, mcpTarget: normalizeStoredMcpTarget(rest.mcpTarget)});
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
     * @summary Find the one other agent already bound to a tenant credential. One current tenant
     * descriptor owns one provider subject; permitting two agents to select it would silently
     * collapse both canonical seats onto the same remote identity.
     * @param {String} tenantId
     * @param {String|null} [exceptId=null]
     * @returns {String|null}
     * @private
     */
    findMcpTenantAssignee(tenantId, exceptId=null) {
        for (const [agentId, definition] of this.agents) {
            if (agentId === exceptId) continue;

            const target = normalizeStoredMcpTarget(definition.mcpTarget);

            if (target?.kind === 'tenant' && target.tenantId === tenantId) {
                return agentId
            }
        }

        return null
    }

    /**
     * @summary The public projection: secrets stripped AND the Brain/operator-only launch override
     * redacted. The result is a DEEP CLONE — a shallow spread would hand every get/list/wire caller
     * the internal metadata object by shared reference, so mutating a returned definition would
     * mutate the registry cache, and the launch redaction would be bypassable through the alias.
     * The spawn path reads the launch through {@link getDefinition} instead.
     * @param {Object} def
     * @returns {Object} A deep-cloned definition, guaranteed to carry no secret and no launch override.
     * @private
     */
    toPublic(def) {
        return redactPublicFields(structuredClone({
            ...def,
            mcpTarget: normalizeStoredMcpTarget(def.mcpTarget)
        }))
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

        let data;

        try {
            data = JSON.parse(fs.readFileSync(file, 'utf8'))
        } catch (error) {
            console.warn(`[FleetRegistryService] Unreadable registry at ${file}; starting empty.`, error.message);
            return new Map();
        }

        return new Map(Object.entries(data.agents || {}))
    }

    /**
     * Persist the in-memory registry to `registry.json` (no secrets).
     * @private
     */
    writeRegistry(agents=this.agents) {
        this.ensureDataDir();

        const payload = {agents: Object.fromEntries(agents)};

        writeFileAtomicSync(this.registryPath(), JSON.stringify(payload, null, 2))
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
     * Encrypt + atomically publish the full credential map to `credentials.enc` (`0600`).
     * @param {Object} map
     * @private
     */
    writeCredentials(map) {
        this.ensureDataDir();

        writeFileAtomicSync(this.credentialsPath(), this.encrypt(JSON.stringify(map)))
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
        return resolveFleetCredentialKey({
            dataDir    : this.getDataDir(),
            serviceName: 'FleetRegistryService'
        })
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
     * @summary Resolve the Fleet-owned durable root from the explicit instance/test override or
     * the canonical `AiConfig.fleet.dataDir` plane member. No service-local default or env read is
     * permitted: registry, tenant, keys, and ciphertext must stay co-located.
     * @returns {String} The resolved Fleet data directory.
     * @private
     */
    getDataDir() {
        return this.dataDir || aiConfig.fleet.dataDir;
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
