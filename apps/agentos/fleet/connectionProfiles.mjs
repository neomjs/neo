/**
 * @module apps/agentos/fleet/connectionProfiles
 * @summary The cockpit's client-side connection-profile contract: ONE versioned endpoint-normalization
 * policy deriving stable profile identity, the closed record schema that keeps credential material out
 * of Body-readable state, and the explicit custody-migration machine across the three custodian shapes.
 *
 * **Identity discipline (the client twin of the fleet's principal discipline).** A profile's identity
 * is derived from exactly one durable coordinate — the canonical endpoint — through the same
 * endpoint-boundary policy the Node side applies (`ai/services/fleet/mcpWireParsing.mjs`,
 * `normalizeSecureMcpEndpoint`, unwidened). The realm boundary carries no imports, so the twin is
 * duplicated by construction and the parity spec is the binding. Display labels, logins, and checkout
 * paths are FORBIDDEN identity keys ({@link PROFILE_FORBIDDEN_IDENTITY_KEYS}): labels are mutable UX,
 * the server stamps the viewer itself so a client-held login is a claim not a coordinate, and checkout
 * paths are machine-local. Identity is also distinct from dialing: the transport may carry
 * non-credential query params the canonical form drops, and the transport's own guards decide what may
 * be dialed.
 *
 * **Custody discipline (the Option-D falsifier as code).** The Body receives a session capability,
 * never the credential. A profile record is pane-renderable state, so the record schema is CLOSED and
 * {@link assertStorableProfileRecord} refuses credential material by field name, by value shape, and
 * by structure — for every custodian shape: the packaged shell stores nothing credential-adjacent
 * (Electron main owns custody), the browser-dev session holds the bearer only in transport closures,
 * and the headless client file stores the NAME of an environment variable, never its value.
 *
 * **Migration discipline.** Moving a profile between custodian shapes is an explicit four-phase
 * transition — read the old custody state, establish the new custody, verify the new connection,
 * retire the old ingress — with rollback legal until retire and a generation counter that advances
 * only on completion, so revocation/rotation truth is never lost to a half-finished move.
 *
 * Worker-realm module: no Node imports, no Neo import — mirrors its siblings
 * `installFleetBridge.mjs` and `redeemFleetBearerHandshake.mjs`, which import their shared security
 * constants from here so the worker realm holds exactly one copy of each.
 */

/**
 * The version of the endpoint-normalization + record contract, stamped into every profile id and
 * record. A record whose `contractVersion` differs from this constant is STALE: its id may not be
 * compared against freshly derived ids, and it must pass {@link rehydrateProfile} before use.
 * @type {Number}
 */
export const FLEET_PROFILE_CONTRACT_VERSION = 1;

/**
 * Canonical shape of the Fleet process bearer: 32 random bytes as unpadded base64url (43 chars).
 * A lightweight FORMAT check only — the Node side owns generation + constant-time verification
 * (`ai/mcp/server/shared/helpers/localBearer.mjs`). The worker realm's single copy: the transport
 * and handshake siblings import it from here, because per-module security copies are a known
 * defect class.
 * @type {RegExp}
 */
export const FLEET_BEARER_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The three custodian shapes a profile's credential custody can take:
 * - `electron-main` — packaged shell; Electron main owns endpoint + credential, the worker holds
 *   only the injected send capability.
 * - `session-only` — direct-browser dev; the bearer lives in transport closures for the session
 *   and is never persisted.
 * - `env-indirection` — headless client file; the profile names an environment variable and the
 *   consuming process resolves it, so the file carries indirection, never material.
 * @type {String[]}
 */
export const PROFILE_CUSTODIANS = Object.freeze(['electron-main', 'session-only', 'env-indirection']);

/**
 * Keys that must NEVER contribute to profile identity, kept as a named list so record-schema and
 * form code reviews have the contract in one place. Enforcement is by construction —
 * {@link deriveFleetProfileId} accepts only the endpoint — and the spec pins that changing any of
 * these never changes the id.
 * @type {String[]}
 */
export const PROFILE_FORBIDDEN_IDENTITY_KEYS = Object.freeze(['label', 'login', 'checkoutPath']);

/**
 * Field names that may never appear on a profile record under ANY custodian: each one is a slot a
 * credential VALUE would ride in. `bearerEnvVar` is deliberately absent — it carries a name, not
 * material, and is admitted per-custodian by {@link CUSTODIAN_STORABLE_CREDENTIAL_FIELDS}.
 * @type {String[]}
 */
export const PROFILE_FORBIDDEN_CREDENTIAL_FIELDS = Object.freeze([
    'authorization', 'bearer', 'bearerToken', 'credential', 'password', 'secret', 'token'
]);

/**
 * The credential-adjacent fields each custodian shape may store on a record. Two shapes store
 * NOTHING — that absence is the design, not an omission: main-process custody and closure custody
 * both leave the record free of anything to protect.
 * @type {Readonly<Object>}
 */
export const CUSTODIAN_STORABLE_CREDENTIAL_FIELDS = Object.freeze({
    'electron-main'  : Object.freeze([]),
    'env-indirection': Object.freeze(['bearerEnvVar']),
    'session-only'   : Object.freeze([])
});

/**
 * The closed core schema of a profile record. Everything else is either a custodian-admitted
 * credential-adjacent field or refused — an open schema would be a smuggling surface.
 * @type {String[]}
 */
const PROFILE_RECORD_CORE_FIELDS = Object.freeze(['canonicalEndpoint', 'contractVersion', 'custodian', 'generation', 'label', 'profileId']);

/**
 * Hosts for which plain `http:` is accepted — the exact-set twin of the Node policy's loopback
 * exception. `[::1]` keeps its brackets: compared against `URL#hostname`, which returns the IPv6
 * literal bracketed.
 * @type {Set<String>}
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Plausible environment-variable name for the env-indirection custodian: conventional upper-snake,
 * so a pasted VALUE (spaces, lowercase base64url, punctuation) is refused as a name.
 * @type {RegExp}
 */
const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * @summary Normalize a candidate fleet endpoint to its canonical identity form, or `null` fail-closed.
 *
 * The client twin of the Node side's shared endpoint-boundary policy, unwidened: http/https only,
 * no credentials-in-URL, TLS required for anything remote — plain `http:` survives only for exact
 * loopback hosts. The canonical form is origin + pathname with trailing slashes stripped, so one
 * endpoint maps to one identity regardless of query, hash, host case, or default-port spelling.
 * The parity spec pins client and Node answers to the same fixture matrix.
 *
 * @param {*} candidateUrl
 * @returns {String|null} the canonical endpoint, or `null` on every refused shape.
 */
export function normalizeFleetEndpoint(candidateUrl) {
    if (typeof candidateUrl !== 'string' || candidateUrl.trim() === '') {
        return null
    }

    let url;

    try {
        url = new URL(candidateUrl.trim())
    } catch {
        return null
    }

    if (url.username || url.password) {
        return null
    }

    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
        return null
    }

    return (url.origin + url.pathname).replace(/\/+$/, '')
}

/**
 * @summary Derive the stable profile id for an endpoint, or `null` when normalization refuses it.
 * The id embeds the contract version, so ids from different contract versions can never collide
 * silently — a stale record re-derives through {@link rehydrateProfile} instead of being compared.
 * @param {*} candidateUrl
 * @returns {String|null}
 */
export function deriveFleetProfileId(candidateUrl) {
    const canonical = normalizeFleetEndpoint(candidateUrl);

    return canonical === null ? null : `fleet-profile:v${FLEET_PROFILE_CONTRACT_VERSION}:${canonical}`
}

/**
 * @summary Assert a profile record is storable: closed schema, flat primitives, custodian-admitted
 * fields only, and no credential material by name or by value shape. Returns a frozen shallow copy
 * so the validated record cannot drift after the check.
 *
 * The value scan refuses ANY own string matching the bearer format — including in `label` — so a
 * secret cannot be smuggled through a display field into pane-renderable state. Records from an
 * older contract version pass shape checks and are the caller's cue to {@link rehydrateProfile};
 * id self-consistency is enforced for current-version records, which catches hand-forged ids.
 *
 * @param {Object} record
 * @returns {Readonly<Object>} the frozen validated record.
 */
export function assertStorableProfileRecord(record) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError('fleet profile record must be a plain object')
    }

    const {canonicalEndpoint, contractVersion, custodian, generation, profileId} = record;

    if (!PROFILE_CUSTODIANS.includes(custodian)) {
        throw new TypeError(`fleet profile custodian must be one of: ${PROFILE_CUSTODIANS.join(', ')}`)
    }

    if (typeof profileId !== 'string' || typeof canonicalEndpoint !== 'string') {
        throw new TypeError('fleet profile record requires string profileId and canonicalEndpoint')
    }

    if (!Number.isInteger(contractVersion) || contractVersion < 1 || !Number.isInteger(generation) || generation < 1) {
        throw new TypeError('fleet profile record requires positive-integer contractVersion and generation')
    }

    const admitted = [...PROFILE_RECORD_CORE_FIELDS, ...CUSTODIAN_STORABLE_CREDENTIAL_FIELDS[custodian]];

    for (const [field, value] of Object.entries(record)) {
        if (PROFILE_FORBIDDEN_CREDENTIAL_FIELDS.includes(field)) {
            throw new TypeError(`fleet profile record refuses credential field '${field}' — the record is pane-renderable state and carries no credential material`)
        }

        if (!admitted.includes(field)) {
            throw new TypeError(`fleet profile record refuses unknown field '${field}' — the schema is closed so there is no smuggling surface`)
        }

        if (value !== null && !['boolean', 'number', 'string'].includes(typeof value)) {
            throw new TypeError(`fleet profile record field '${field}' must be a flat primitive — nested values defeat the credential scan`)
        }

        if (typeof value === 'string' && FLEET_BEARER_PATTERN.test(value)) {
            throw new TypeError(`fleet profile record field '${field}' carries bearer-shaped material — a credential never enters Body-readable state`)
        }
    }

    if (contractVersion === FLEET_PROFILE_CONTRACT_VERSION && deriveFleetProfileId(canonicalEndpoint) !== profileId) {
        throw new TypeError('fleet profile id does not re-derive from its canonical endpoint — ids are derived, never hand-assigned')
    }

    return Object.freeze({...record})
}

/**
 * @summary Create a validated, frozen profile record for one endpoint under one custodian shape.
 * The single producer path: creation routes through {@link assertStorableProfileRecord}, so every
 * live record has passed the same guard.
 * @param {Object}  opts
 * @param {String}  opts.endpoint               Raw endpoint; identity derives from its canonical form.
 * @param {String}  opts.custodian              One of {@link PROFILE_CUSTODIANS}.
 * @param {String}  [opts.label]                Display label — mutable UX, never identity.
 * @param {String}  [opts.bearerEnvVar]         env-indirection only: the environment-variable NAME
 *     the consuming process resolves; conventional upper-snake, so a pasted value is refused.
 * @returns {Readonly<Object>}
 */
export function createFleetProfile({endpoint, custodian, label, bearerEnvVar} = {}) {
    const canonicalEndpoint = normalizeFleetEndpoint(endpoint);

    if (canonicalEndpoint === null) {
        throw new TypeError('createFleetProfile requires an https endpoint, or plain http on an exact loopback host, with no credentials in the URL')
    }

    if (bearerEnvVar !== undefined) {
        if (custodian !== 'env-indirection') {
            throw new TypeError("createFleetProfile: bearerEnvVar is the env-indirection custodian's field — other shapes store nothing credential-adjacent")
        }

        if (typeof bearerEnvVar !== 'string' || !ENV_VAR_NAME_PATTERN.test(bearerEnvVar)) {
            throw new TypeError('createFleetProfile: bearerEnvVar must be an environment-variable NAME (upper-snake), never a value')
        }
    }

    return assertStorableProfileRecord({
        canonicalEndpoint,
        contractVersion: FLEET_PROFILE_CONTRACT_VERSION,
        custodian,
        generation     : 1,
        profileId      : deriveFleetProfileId(canonicalEndpoint),
        ...(label       !== undefined ? {label} : {}),
        ...(bearerEnvVar !== undefined ? {bearerEnvVar} : {})
    })
}

/**
 * @summary Whether a record was written under a different contract version. A stale record's id is
 * not comparable to freshly derived ids; pass it through {@link rehydrateProfile} before use.
 * @param {Object} record
 * @returns {Boolean}
 */
export function isStaleProfile(record) {
    return record?.contractVersion !== FLEET_PROFILE_CONTRACT_VERSION
}

/**
 * @summary Re-derive a stale record under the current contract, preserving custody truth: custodian,
 * generation, label, and any custodian-admitted fields survive; identity is re-derived from the
 * stored canonical endpoint. An endpoint the current contract refuses cannot be silently upgraded —
 * that is the stale-profile behavior: refuse loudly, recreate from the raw endpoint deliberately.
 * @param {Object} record
 * @returns {Readonly<Object>} the current-version record.
 */
export function rehydrateProfile(record) {
    const {canonicalEndpoint} = record ?? {},
          rederived           = deriveFleetProfileId(canonicalEndpoint);

    if (rederived === null) {
        throw new TypeError(`fleet profile cannot rehydrate — its stored endpoint no longer normalizes under contract v${FLEET_PROFILE_CONTRACT_VERSION}; recreate the profile from its raw endpoint`)
    }

    return assertStorableProfileRecord({
        ...record,
        canonicalEndpoint: normalizeFleetEndpoint(canonicalEndpoint),
        contractVersion  : FLEET_PROFILE_CONTRACT_VERSION,
        profileId        : rederived
    })
}

/**
 * The four explicit phases of a custody migration, in execution order: read the old custody state,
 * establish the new custody, verify the new connection, retire the old ingress.
 * @type {String[]}
 */
export const CUSTODY_MIGRATION_PHASES = Object.freeze(['read-old', 'establish', 'verify', 'retire']);

/**
 * @summary Create the explicit state machine for moving one profile between custodian shapes.
 *
 * `advance()` declares the current phase done and returns the next (or `null` when retire
 * completes). `rollback()` is legal until completion and is TERMINAL: the machine reports the old
 * custodian and the unchanged generation, and a fresh migration must be created to try again —
 * retire is the point of no return in both directions, so a rotation or revocation that happened
 * mid-migration is never papered over by replaying phases. `nextGeneration` is readable only after
 * completion: the generation counter advances exactly when the old ingress is retired.
 *
 * @param {Object} opts
 * @param {String} opts.fromCustodian One of {@link PROFILE_CUSTODIANS}.
 * @param {String} opts.toCustodian   One of {@link PROFILE_CUSTODIANS}, different from `fromCustodian`.
 * @param {Number} opts.generation    The profile's current generation.
 * @returns {Object} the migration machine.
 */
export function createCustodyMigration({fromCustodian, toCustodian, generation} = {}) {
    if (!PROFILE_CUSTODIANS.includes(fromCustodian) || !PROFILE_CUSTODIANS.includes(toCustodian)) {
        throw new TypeError(`custody migration requires custodians from: ${PROFILE_CUSTODIANS.join(', ')}`)
    }

    if (fromCustodian === toCustodian) {
        throw new TypeError('custody migration requires two DIFFERENT custodian shapes — re-establishing the same custody is a reconnect, not a migration')
    }

    if (!Number.isInteger(generation) || generation < 1) {
        throw new TypeError('custody migration requires the profile\'s positive-integer generation')
    }

    let phaseIndex = 0,
        completed  = false,
        rolledBack = false;

    return Object.freeze({
        fromCustodian,
        toCustodian,

        get phase() {
            return completed || rolledBack ? null : CUSTODY_MIGRATION_PHASES[phaseIndex]
        },

        get completed() {
            return completed
        },

        get rolledBack() {
            return rolledBack
        },

        /**
         * @summary The generation the profile carries after this migration — readable only once
         * retire completed, because generation truth advances exactly there.
         * @returns {Number}
         */
        get nextGeneration() {
            if (!completed) {
                throw new Error('custody migration generation advances only at retire — an incomplete or rolled-back migration keeps the old custody truth')
            }

            return generation + 1
        },

        /**
         * @summary Declare the current phase done. Returns the next phase, or `null` when the
         * retire phase completes the migration.
         * @returns {String|null}
         */
        advance() {
            if (completed || rolledBack) {
                throw new Error('custody migration is terminal — create a new migration to move custody again')
            }

            if (phaseIndex === CUSTODY_MIGRATION_PHASES.length - 1) {
                completed = true;
                return null
            }

            phaseIndex++;
            return CUSTODY_MIGRATION_PHASES[phaseIndex]
        },

        /**
         * @summary Abandon the migration before retire: the old custodian remains the custody
         * truth at the unchanged generation, and this machine becomes terminal.
         * @returns {Object} `{custodian, generation}` — the restored custody truth.
         */
        rollback() {
            if (completed) {
                throw new Error('custody migration cannot roll back after retire — the old ingress is gone; create a new migration instead')
            }

            if (rolledBack) {
                throw new Error('custody migration is terminal — create a new migration to move custody again')
            }

            rolledBack = true;
            return {custodian: fromCustodian, generation}
        }
    })
}

/**
 * @summary The executable retire phase for the cockpit's pre-boot bearer ingress: clear the
 * launcher hand-off slot once transport custody holds the bearer in closure. External producers
 * (Electron main, Neural Link init scripts, test setups) still PLACE the bearer there before app
 * start — the slot remains the ingress; after establish + verify it stops being residence, which
 * is what keeps the credential out of durable Body-readable state.
 *
 * `expected` is the compare-and-swap guard: when given, the slot is retired only while it still
 * holds exactly that value — the credential that PROVABLY verified into closure custody. A value a
 * producer rotated in during verification is a different credential that never verified, so it
 * survives the retire attempt; deleting it would destroy rotation truth the migration contract
 * promises to keep. `field` selects which ingress slot of the launch contract is being retired —
 * the class-1 bearer by default, or the class-3 `mcAuthorization` mint, which rides the same
 * transient-ingress discipline.
 * @param {Object} target             The global-shaped object carrying `AgentOS.fleet`.
 * @param {Object} [opts]
 * @param {String} [opts.expected]              Retire only if the slot still equals this exact value.
 * @param {String} [opts.field='bearerToken']   Which launch-contract ingress slot to retire.
 * @returns {Boolean} whether a credential was present (and matching, when guarded) and retired.
 */
export function retireBearerIngressSlot(target, {expected, field = 'bearerToken'} = {}) {
    const fleet = target?.AgentOS?.fleet;

    if (fleet && field in fleet && (expected === undefined || fleet[field] === expected)) {
        delete fleet[field];
        return true
    }

    return false
}
