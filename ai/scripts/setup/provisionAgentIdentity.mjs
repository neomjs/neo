#!/usr/bin/env node
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';
import {IDENTITIES, TRUST_TIERS} from '../../graph/identityRoots.mjs';

/**
 * @module ai/scripts/setup/provisionAgentIdentity
 * @summary Day-0 resident-identity provisioning (R3a of the peer-onboarding rail): builds and —
 * under `--commit` — persists the Memory Core resident `AgentIdentity` node and the Day-0 wake
 * route (`WAKE_SUBSCRIPTION` node AND its `SUBSCRIBES_TO` edge) for ONE new resident. Dry-run by
 * default; the dry-run reads the live graph read-only and renders the TRUE desired-vs-current
 * delta — on a fully provisioned resident, dry-run and commit both honestly report zero writes.
 *
 * **Three identity layers, kept separate by construction (the successor contract):**
 * 1. **Durable resident identity** — the anchor this script provisions. It survives model swaps,
 *    family placement, and instance topology: the same resident may run different engines across
 *    months and remain the same peer. The resident handle is the `AgentIdentity` id, the mailbox
 *    owner, and the wake owner.
 * 2. **Fleet instance id** — an operational key, never an identity. One resident can own multiple
 *    Fleet instances, so the optional `--fleet-instance-id` records ADDITIVE linkage on the
 *    resident (`properties.fleetInstanceIds`, union-merged on re-entry) and is never substituted
 *    for the resident key anywhere durable.
 * 3. **Runtime-observed engine episode** — deliberately ABSENT here. There is NO `--model` input:
 *    engine embodiment opens when the runtime observes the engine (handshake evidence), never
 *    from an operator prediction at provisioning time. Engine-class flags are rejected loudly.
 *
 * **Why the input surface has NO socialName-class parameter (load-bearing):** Social Names are
 * the post-boot peer-naming ritual — peer-sketched, bearer-assented, peer-vetoable,
 * operator-confirmed. They are NEVER seed data: a name provisioned before the bearer can assent
 * would fabricate the assent. Day-0 residents get the handle-derived display form only, and any
 * socialName-class input (flag or option key) is rejected loudly instead of ignored.
 *
 * **Idempotency = full read/compare/repair.** Re-entry reads EVERY required node and edge
 * (including the `SUBSCRIBES_TO` edge — a wake node without its edge is NOT provisioned),
 * compares every declared identity-contract field, repairs missing pieces (edge, instance
 * linkage), and refuses loudly on contract divergence or wrong-type rows. Display-form fields
 * (`name` / `displayName`) are compared as non-blocking notes: the naming ritual legitimately
 * evolves them post-boot, so a granted name never bricks re-entry.
 *
 * **Post-verify:** after `--commit`, the write set is re-read and re-decided; success is only
 * reported when the re-decision is zero-op. A crash-interrupted commit therefore completes on
 * re-run, and a "successful" run that failed to persist is caught, not assumed.
 *
 * **Write path (side-effect half, `--commit` only):** the sibling seed script's real path —
 * `Memory_GraphService` from `ai/services.mjs` (`initAsync` → `upsertGlobalNode` for the
 * identity substrate + `upsertNode` / `linkNodes` for the wake route, matching
 * `WakeSubscriptionService.subscribe`'s durable shape). Services are imported lazily inside the
 * commit branch. Dry-run opens a READ-ONLY SQLite connection at the owning config leaf
 * (`AiConfig.storagePaths.graph`) and writes nothing; an absent graph file is reported as empty
 * state (the delta is then the full desired set, which is the truth).
 *
 * **Why the Day-0 wake route is `mcp-notifications` (Shape A):** richer routes require
 * boot-environment facts (appName, per-instance address) that do not exist at provisioning
 * time — fabricating them is exactly the hardcoded-route rot the wake-subscription migration
 * exists to clean up. Shape A is the only metadata-free channel, so the resident has a live wake
 * surface from minute zero; the runtime `manage_wake_subscription {action: 'bootstrap'}`
 * self-registration upgrades the route from the real boot envelope. Any ACTIVE same-trigger
 * route owned by the resident counts as wake-provisioned — Day-0 never duplicates fanout beside
 * a richer self-registered route.
 *
 * Everything decision-shaped here is pure and fail-closed: builders/validators return
 * `{valid, reason, ...}` and never throw; an invalid plan, a divergent existing state, or a
 * wrong-type row refuses loudly and writes NOTHING. This script never writes committed files —
 * the committed-file surfaces are the follow-up PR ({@link R3B_FOLLOW_UP_CHECKLIST}), printed on
 * every successful run.
 *
 * **Usage**:
 *   node ai/scripts/setup/provisionAgentIdentity.mjs --resident-id <s> --family <s>
 *       [--display-name <s>] [--github-username <s>] [--mailbox <s>]
 *       [--fleet-instance-id <s>]                                # dry-run (default, read-only)
 *   node ai/scripts/setup/provisionAgentIdentity.mjs ... --commit    # execute + post-verify
 *   node ai/scripts/setup/provisionAgentIdentity.mjs --help          # print usage
 */

const __filename = fileURLToPath(import.meta.url);

/**
 * @summary The socialName-class option keys the provisioning input surface REJECTS. Social
 * Names are the post-boot peer-naming ritual (bearer-assented), never seed data — rejecting
 * instead of ignoring keeps the guard visible to callers.
 * @type {ReadonlyArray<String>}
 */
export const SOCIAL_NAME_CLASS_KEYS = Object.freeze([
    'disclosablePrior', 'name', 'salute', 'socialLayer', 'socialName'
]);

/**
 * @summary The socialName-class CLI flags rejected with the ritual pointer (the flag-shaped
 * mirror of {@link SOCIAL_NAME_CLASS_KEYS}).
 * @type {ReadonlyArray<String>}
 */
export const SOCIAL_NAME_CLASS_FLAGS = Object.freeze([
    '--disclosable-prior', '--name', '--salute', '--social-layer', '--social-name'
]);

/**
 * @summary The engine-class option keys the provisioning input surface REJECTS. Engine
 * embodiment is observation-owned: an episode opens when the runtime observes the engine, never
 * from an operator prediction at Day-0 — a `--model` here would be fabricated observation.
 * @type {ReadonlyArray<String>}
 */
export const ENGINE_CLASS_KEYS = Object.freeze([
    'capabilities', 'engine', 'engineTag', 'model'
]);

/**
 * @summary The engine-class CLI flags rejected with the observation pointer (the flag-shaped
 * mirror of {@link ENGINE_CLASS_KEYS}).
 * @type {ReadonlyArray<String>}
 */
export const ENGINE_CLASS_FLAGS = Object.freeze([
    '--capabilities', '--engine', '--engine-tag', '--model'
]);

/**
 * @summary The Day-0 wake route defaults: `SENT_TO_ME` on the metadata-free `mcp-notifications`
 * channel, high-priority filtered — mirroring the roster templates' trigger/filter idiom
 * without fabricating harness facts (see module JSDoc).
 * @type {Object}
 */
export const WAKE_SUBSCRIPTION_DEFAULTS = Object.freeze({
    trigger      : 'SENT_TO_ME',
    filters      : Object.freeze({priority: 'high'}),
    harnessTarget: 'mcp-notifications'
});

/**
 * @summary The identity-contract fields compared verbatim on re-entry — divergence on ANY of
 * these refuses the whole run (loud diff, nothing written). Dotted paths reach into
 * `identityContract`. Display-form fields (`name` / `displayName`) are deliberately NOT here:
 * the naming ritual evolves them post-boot, so they surface as non-blocking notes instead.
 * @type {ReadonlyArray<String>}
 */
export const IDENTITY_CONTRACT_FIELDS = Object.freeze([
    'accountType',
    'githubLogin',
    'identityContract.canonicalIdentityId',
    'identityContract.requiredA2aMailboxAddress',
    'identityContract.requiredGithubLogin',
    'modelFamily',
    'participationStatus',
    'trustTier'
]);

/**
 * @summary The follow-up checklist: the committed-file surfaces a roots-onboarding PR must touch
 * AFTER Day-0 provisioning. This script NEVER writes committed files itself.
 * @type {ReadonlyArray<String>}
 */
export const R3B_FOLLOW_UP_CHECKLIST = Object.freeze([
    'ai/graph/identityRoots.mjs — add the resident\'s IDENTITIES roster entry (Layer-1 operational fields; social layer stays empty until the naming ritual)',
    'README.md — add the maintainer roster row (Name / Maintainer / Role / Identity table)',
    'learn/agentos/ModelStats.md — add the resident\'s capability section (source-cited; capability facts live HERE, never guessed at provisioning)',
    'ai/graph/identityRootsMigration.mjs — check REGISTRY_MODEL_DESIGNATIONS + the MIGRATION_EPOCH note (post-epoch onboarding must NOT retro-seed; the engine era opens at first OBSERVED embodiment, never at provisioning)',
    'test/playwright/unit/ai/graph/identityRoots.spec.mjs — pin the new roster entry'
]);

/**
 * @summary Normalizes a handle-shaped input to its canonical `@`-prefixed form; fail-closed on
 * empty or malformed values.
 * @param {String} value Raw handle input (with or without the `@` prefix)
 * @param {String} label Field name for the refusal message
 * @returns {{valid: Boolean, reason: String|null, handle: String|null}}
 */
export function normalizeHandle(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        return {valid: false, reason: `${label} requires a non-empty string`, handle: null};
    }

    const body = value.trim().replace(/^@/, '');

    if (!/^[a-z0-9][a-z0-9-]*$/.test(body)) {
        return {valid: false, reason: `${label} must be a lowercase handle ([a-z0-9-], e.g. '@neo-fable-clio') — received '${value}'`, handle: null};
    }

    return {valid: true, reason: null, handle: `@${body}`}
}

/**
 * @summary Normalizes a Fleet instance id to its plain lowercase-token form — deliberately NOT
 * `@`-prefixed: the instance id is an operational Fleet-registry key, not an addressable
 * identity handle, and keeping the forms visually distinct guards the layer boundary.
 * @param {String} value Raw Fleet instance id
 * @returns {{valid: Boolean, reason: String|null, token: String|null}}
 */
export function normalizeInstanceToken(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return {valid: false, reason: '--fleet-instance-id, when given, requires a non-empty string', token: null};
    }

    const token = value.trim();

    if (!/^[a-z0-9][a-z0-9-]*$/.test(token)) {
        return {valid: false, reason: `--fleet-instance-id must be a lowercase token ([a-z0-9-], no '@' — it is a Fleet-registry key, not an identity handle) — received '${value}'`, token: null};
    }

    return {valid: true, reason: null, token}
}

/**
 * @summary Derives the handle-derived DISPLAY form from a resident id — the operational default
 * a resident keeps until (and unless) the naming ritual grants a Social Name.
 * E.g. '@neo-fable-clio' → 'Neo Fable Clio'.
 * @param {String} residentId The `@`-prefixed resident id
 * @returns {String}
 */
export function deriveDisplayForm(residentId) {
    return residentId
        .replace(/^@/, '')
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/**
 * @summary Builds the frozen Day-0 provisioning plan (the PURE half): the resident
 * `AgentIdentity` write spec (Layer-1 fields only, keyed by the durable resident handle), the
 * Day-0 wake route (node + `SUBSCRIBES_TO` edge), and the optional Fleet instance linkage. The
 * input surface has NO socialName-class and NO engine-class parameter (module JSDoc); both
 * classes are rejected loudly.
 * @param {Object} options
 * @param {String} options.residentId The durable resident identity handle — the anchor key
 * @param {String} options.family Model family (e.g. 'claude' | 'gpt' | 'gemini') — the flat operational field the current surface reads
 * @param {String} [options.displayName] Handle-derived display form override — operational display, NOT a Social Name
 * @param {String} [options.githubUsername] GitHub login (defaults to the resident id)
 * @param {String} [options.mailbox] A2A mailbox address (defaults to the resident id)
 * @param {String} [options.fleetInstanceId] Optional Fleet instance id — ADDITIVE linkage on the resident, never a durable key
 * @param {Date|String} [options.now] Clock override for deterministic tests; defaults to the real now
 * @returns {{valid: Boolean, reason: String|null, plan: Object|null}}
 */
export function buildProvisionPlan(options = {}) {
    const leakedSocial = SOCIAL_NAME_CLASS_KEYS.filter(key => key in options);

    if (leakedSocial.length > 0) {
        return {valid: false, reason: `socialName-class inputs are rejected by design: ${leakedSocial.join(', ')} — Social Names are the post-boot peer-naming ritual (bearer-assented), never seed data`, plan: null};
    }

    const leakedEngine = ENGINE_CLASS_KEYS.filter(key => key in options);

    if (leakedEngine.length > 0) {
        return {valid: false, reason: `engine-class inputs are rejected by design: ${leakedEngine.join(', ')} — engine embodiment opens at first OBSERVED runtime evidence, never from an operator prediction at Day-0`, plan: null};
    }

    const resident = normalizeHandle(options.residentId, '--resident-id');

    if (!resident.valid) {
        return {valid: false, reason: resident.reason, plan: null};
    }

    if (typeof options.family !== 'string' || !/^[a-z][a-z0-9-]*$/.test(options.family)) {
        return {valid: false, reason: `--family must be a lowercase family token (e.g. 'claude') — received '${String(options.family)}'`, plan: null};
    }

    if (options.displayName !== undefined && (typeof options.displayName !== 'string' || options.displayName.trim() === '')) {
        return {valid: false, reason: '--display-name, when given, requires a non-empty string', plan: null};
    }

    const github = normalizeHandle(options.githubUsername === undefined ? resident.handle : options.githubUsername, '--github-username');

    if (!github.valid) {
        return {valid: false, reason: github.reason, plan: null};
    }

    const mailbox = normalizeHandle(options.mailbox === undefined ? resident.handle : options.mailbox, '--mailbox');

    if (!mailbox.valid) {
        return {valid: false, reason: mailbox.reason, plan: null};
    }

    let fleetInstanceId = null;

    if (options.fleetInstanceId !== undefined) {
        const instance = normalizeInstanceToken(options.fleetInstanceId);

        if (!instance.valid) {
            return {valid: false, reason: instance.reason, plan: null};
        }

        fleetInstanceId = instance.token;
    }

    const nowMs = Date.parse(options.now === undefined ? new Date().toISOString() : options.now);

    if (!Number.isFinite(nowMs)) {
        return {valid: false, reason: `the provisioning timestamp must be parseable — received '${String(options.now)}' (records carry the ACTUAL provisioning time; no backfill)`, plan: null};
    }

    const residentId  = resident.handle,
          since       = new Date(nowMs).toISOString(),
          displayForm = options.displayName === undefined ? deriveDisplayForm(residentId) : options.displayName.trim(),
          handleBody  = residentId.slice(1);

    const writeSpecs = Object.freeze({
        // The durable resident node (the addressable A2A / wake / permission surface). Layer-1
        // operational fields ONLY: name is the handle-derived display form, NOT a Social Name;
        // engine facts are absent by design (observation-owned); modelFamily stays flat because
        // the CURRENT operational surface reads it flat. fleetInstanceIds is ADDITIVE linkage —
        // an operational pointer list, never a key.
        identity: Object.freeze({
            id         : residentId,
            type       : 'AgentIdentity',
            name       : displayForm,
            description: `Day-0 provisioned ${options.family}-family maintainer identity.`,
            properties : Object.freeze({
                githubLogin     : github.handle,
                displayName     : displayForm,
                modelFamily     : options.family,
                accountType     : 'agent',
                trustTier       : TRUST_TIERS.PEER_TRUSTED,
                identityContract: Object.freeze({
                    canonicalIdentityId      : residentId,
                    requiredGithubLogin      : github.handle,
                    requiredA2aMailboxAddress: mailbox.handle
                }),
                fleetInstanceIds   : Object.freeze(fleetInstanceId ? [fleetInstanceId] : []),
                participationStatus: 'active',
                statusReason       : null,
                authority          : null,
                since              : null,
                reactivationTrigger: null,
                createdAt          : since
            })
        }),
        // The durable wake route — the exact node + edge shape WakeSubscriptionService.subscribe
        // persists, on the only channel that requires no fabricated harness metadata.
        wakeSubscription: Object.freeze({
            id        : `WAKE_SUB:day0-${handleBody}`,
            type      : 'WAKE_SUBSCRIPTION',
            properties: Object.freeze({
                agentIdentity        : residentId,
                trigger              : WAKE_SUBSCRIPTION_DEFAULTS.trigger,
                filters              : WAKE_SUBSCRIPTION_DEFAULTS.filters,
                harnessTarget        : WAKE_SUBSCRIPTION_DEFAULTS.harnessTarget,
                harnessTargetMetadata: Object.freeze({}),
                createdAt            : since,
                updatedAt            : since,
                userId               : handleBody,
                sharedEntity         : false,
                status               : 'active'
            })
        }),
        wakeEdge: Object.freeze({
            source      : residentId,
            target      : `WAKE_SUB:day0-${handleBody}`,
            relationship: 'SUBSCRIBES_TO',
            weight      : 1.0
        })
    });

    return {
        valid : true,
        reason: null,
        plan  : Object.freeze({
            residentId,
            family        : options.family,
            displayForm,
            githubUsername: github.handle,
            mailbox       : mailbox.handle,
            fleetInstanceId,
            since,
            writeSpecs
        })
    }
}

/**
 * @summary The complete ordered DESIRED write set for a plan — what a from-scratch provision
 * executes. The actual write set is the delta {@link decideProvision} computes against live
 * state (repairs included), so callers rendering "what will happen" must render the DECISION's
 * writes, never this raw set.
 * @param {Object} plan A valid plan from {@link buildProvisionPlan}
 * @returns {Object[]} Ordered ops `{surface, op, spec|edge}`
 */
export function planWrites(plan) {
    return [
        {surface: 'identity', op: 'upsertGlobalNode', spec: plan.writeSpecs.identity},
        {surface: 'wake',     op: 'upsertNode',       spec: plan.writeSpecs.wakeSubscription},
        {surface: 'wakeEdge', op: 'linkNodes',        edge: plan.writeSpecs.wakeEdge}
    ];
}

/**
 * @summary Parses a graph `Nodes` row's JSON payload; fail-closed on unparseable data. Surfaces
 * `name`/`description` alongside `label`/`properties` so repair ops can rebuild a full
 * non-clobbering upsert spec from the persisted row.
 * @param {Object|undefined} row `{id, data}` from SQLite, or undefined when absent
 * @returns {Object|null} `{id, label, name, description, properties}`, `{id, parseError}`, or null when absent
 */
export function parseNodeRow(row) {
    if (!row) return null;

    try {
        const node = JSON.parse(row.data);

        return {id: row.id, label: node.label, name: node.name, description: node.description, properties: node.properties || {}}
    } catch (error) {
        return {id: row.id, parseError: error.message}
    }
}

/**
 * @summary Reads the existing graph state a provisioning decision needs — nodes AND the
 * `SUBSCRIBES_TO` edges (a wake node without its edge is not provisioned; the edge is part of
 * the read-set by contract). Kept raw-SQLite (the durable-row idiom the wake substrate peeks
 * through) so it is testable against an in-memory database and usable on a READ-ONLY dry-run
 * connection.
 * @param {Object} sqlite Open better-sqlite3 connection (the graph storage's `db`)
 * @param {Object} plan A valid plan from {@link buildProvisionPlan}
 * @returns {{identityRow: Object|null, wakeRows: Object[], subscribesToEdges: Object[]}}
 */
export function readExistingState(sqlite, plan) {
    const identityRow = parseNodeRow(sqlite.prepare('SELECT id, data FROM Nodes WHERE id = ? LIMIT 1').get(plan.residentId));

    const wakeRows = sqlite.prepare(`
        SELECT id, data FROM Nodes
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.agentIdentity') = ?
    `).all(plan.residentId).map(parseNodeRow);

    const subscribesToEdges = sqlite.prepare(`
        SELECT id, source, target, type FROM Edges
        WHERE source = ? AND type = 'SUBSCRIBES_TO'
    `).all(plan.residentId);

    return {identityRow, wakeRows, subscribesToEdges}
}

/**
 * @summary Reads a dotted-path value from an identity row's properties (one level of nesting —
 * the `identityContract.*` paths).
 * @param {Object} properties The parsed row's properties
 * @param {String} fieldPath Flat key or `parent.child` path
 * @returns {*}
 */
function readContractField(properties, fieldPath) {
    const parts = fieldPath.split('.');

    return parts.length === 1 ? properties[parts[0]] : (properties[parts[0]] || {})[parts[1]];
}

/**
 * @summary The pure idempotence decision — full read/compare/repair. Per surface:
 * `create` (absent) / `exists` (present + contract-equivalent) / `repair` (present but missing a
 * required piece: the `SUBSCRIBES_TO` edge, or a not-yet-linked Fleet instance id). Contract
 * divergence or a wrong-type row refuses the WHOLE run (loud diff, nothing written); display-form
 * drift (`name`/`displayName`) is reported as non-blocking notes because the naming ritual
 * legitimately evolves those post-boot. The returned `writes` are the TRUE delta — a fully
 * provisioned resident decides zero ops, which is exactly what dry-run renders and what
 * post-verify asserts.
 *
 * Repair ops never clobber: the instance-linkage repair rebuilds the upsert spec FROM the
 * persisted row (union-merging `fleetInstanceIds` only), and the edge repair targets the
 * EXISTING accepted wake node, not the Day-0 template id.
 * @param {Object} options
 * @param {Object} options.plan A valid plan from {@link buildProvisionPlan}
 * @param {Object} options.existing State from {@link readExistingState}
 * @param {String[]} [options.rosterIds] Committed-roster ids (test seam; defaults to `identityRoots.IDENTITIES`)
 * @returns {{valid: Boolean, reason: String|null, alreadyProvisioned: Boolean, surfaces: Object, divergences: Object[], notes: Object[], writes: Object[]}}
 */
export function decideProvision({plan, existing = {}, rosterIds = IDENTITIES.map(identity => identity.id)} = {}) {
    const refuse = reason => ({valid: false, reason, alreadyProvisioned: false, surfaces: {}, divergences: [], notes: [], writes: []});

    if (!plan || !plan.writeSpecs) {
        return refuse('decideProvision requires a valid plan from buildProvisionPlan');
    }

    const identityRow       = existing.identityRow || null,
          wakeRows          = existing.wakeRows || [],
          subscribesToEdges = existing.subscribesToEdges || [],
          divergences       = [],
          notes             = [],
          writes            = [];

    for (const row of [identityRow, ...wakeRows]) {
        if (row && row.parseError) {
            return refuse(`existing graph row '${row.id}' is unparseable (${row.parseError}) — refusing to decide against corrupt state`);
        }
    }

    // Committed-roster residents already own identity substrate via the boot-time roster
    // seeding path and the committed roots file — Day-0 provisioning targets NEW residents only.
    if (rosterIds.includes(plan.residentId)) {
        return refuse(`${plan.residentId} is a committed-roster resident (ai/graph/identityRoots.mjs) — its identity substrate is owned by the committed seeding path; Day-0 provisioning targets new residents only`);
    }

    // --- identity surface -------------------------------------------------------------------
    let identityAction = 'create';

    if (identityRow) {
        // Wrong-type refusal: a row squatting on the resident key that is not an AgentIdentity
        // must never receive identity writes.
        if (identityRow.label !== 'AgentIdentity') {
            return refuse(`node '${plan.residentId}' exists with type '${identityRow.label}', not AgentIdentity — refusing to write identity substrate onto a wrong-type row`);
        }

        identityAction = 'exists';

        const props = identityRow.properties;

        for (const fieldPath of IDENTITY_CONTRACT_FIELDS) {
            const existingValue = readContractField(props, fieldPath),
                  plannedValue  = readContractField(plan.writeSpecs.identity.properties, fieldPath);

            if (existingValue !== plannedValue) {
                divergences.push({surface: 'identity', field: fieldPath, existing: existingValue, planned: plannedValue});
            }
        }

        // Display-form drift is a note, never a refusal: the naming ritual evolves these.
        if (props.displayName !== plan.displayForm) {
            notes.push({surface: 'identity', field: 'displayName', existing: props.displayName, planned: plan.displayForm,
                note: 'display forms may legitimately evolve post-boot (naming ritual) — not treated as divergence'});
        }

        // Fleet instance linkage is ADDITIVE: a new instance id on a known resident is a repair
        // (union-merge), never divergence — one resident legitimately accrues instances.
        if (plan.fleetInstanceId) {
            const linked = Array.isArray(props.fleetInstanceIds) ? props.fleetInstanceIds : [];

            if (!linked.includes(plan.fleetInstanceId)) {
                identityAction = 'repair';

                const mergedSpec = {
                    id  : identityRow.id,
                    type: identityRow.label,
                    ...(identityRow.name !== undefined && {name: identityRow.name}),
                    ...(identityRow.description !== undefined && {description: identityRow.description}),
                    properties: {...props, fleetInstanceIds: [...linked, plan.fleetInstanceId]}
                };

                writes.push({surface: 'identity', op: 'upsertGlobalNode', spec: mergedSpec, repair: 'fleet-instance-link'});
            }
        }
    }

    // --- wake surface -------------------------------------------------------------------------
    // Any ACTIVE same-trigger route owned by the resident counts as the provisioned wake node —
    // including a richer self-registered runtime route; Day-0 never duplicates fanout beside it.
    const activeWakeRows = wakeRows.filter(row =>
        (row.properties.status || 'active') === 'active' &&
        row.properties.trigger === WAKE_SUBSCRIPTION_DEFAULTS.trigger
    );

    let wakeAction     = 'create',
        wakeEdgeAction = 'create',
        edgeTargetId   = plan.writeSpecs.wakeSubscription.id;

    if (activeWakeRows.length > 0) {
        wakeAction = 'exists';

        // The edge is part of the provisioned contract: an accepted wake node without its
        // SUBSCRIBES_TO edge is a crash-window remnant — repair the edge, targeting the row
        // that actually exists.
        const edgeTargets = new Set(subscribesToEdges.map(edge => edge.target)),
              linkedRow   = activeWakeRows.find(row => edgeTargets.has(row.id));

        if (linkedRow) {
            wakeEdgeAction = 'exists';
        } else {
            wakeEdgeAction = 'repair';
            edgeTargetId   = activeWakeRows[0].id;
        }
    }

    const surfaces = {identity: identityAction, wake: wakeAction, wakeEdge: wakeEdgeAction};

    if (divergences.length > 0) {
        return {
            valid             : false,
            reason            : `existing state diverges from the identity contract on ${divergences.length} field(s) — nothing will be written`,
            alreadyProvisioned: false,
            surfaces,
            divergences,
            notes,
            writes            : []
        };
    }

    if (identityAction === 'create') {
        writes.unshift({surface: 'identity', op: 'upsertGlobalNode', spec: plan.writeSpecs.identity});
    }

    if (wakeAction === 'create') {
        writes.push({surface: 'wake', op: 'upsertNode', spec: plan.writeSpecs.wakeSubscription});
    }

    if (wakeEdgeAction !== 'exists') {
        writes.push({surface: 'wakeEdge', op: 'linkNodes', edge: {
            source      : plan.residentId,
            target      : edgeTargetId,
            relationship: 'SUBSCRIBES_TO',
            weight      : 1.0
        }});
    }

    return {
        valid             : true,
        reason            : null,
        alreadyProvisioned: writes.length === 0,
        surfaces,
        divergences       : [],
        notes,
        writes
    };
}

/**
 * @summary Renders a decision's TRUE write delta as printable lines — dry-run output and commit
 * behavior derive from the SAME decision, so what dry-run prints and what `--commit` writes
 * cannot drift; a fully provisioned resident renders zero operations, honestly.
 * @param {Object} plan A valid plan from {@link buildProvisionPlan}
 * @param {Object} decision A decision from {@link decideProvision}
 * @returns {String[]}
 */
export function renderDecision(plan, decision) {
    const lines = [`[provisionAgentIdentity] decision for ${plan.residentId} (resident anchor; since: ${plan.since})`, ''];

    for (const [surface, action] of Object.entries(decision.surfaces)) {
        lines.push(`  [${action.toUpperCase()}] ${surface}`);
    }
    lines.push('');

    for (const note of decision.notes) {
        lines.push(`  [NOTE] ${note.surface}.${note.field}: existing '${note.existing}' vs planned '${note.planned}' — ${note.note}`);
    }

    if (decision.notes.length > 0) {
        lines.push('');
    }

    if (decision.writes.length === 0) {
        lines.push('  (zero operations — the resident is fully provisioned; commit would write nothing)');
        lines.push('');
        return lines;
    }

    for (const write of decision.writes) {
        if (write.op === 'linkNodes') {
            lines.push(`  [${write.surface}] linkNodes ${write.edge.source} -[${write.edge.relationship}]-> ${write.edge.target} (weight ${write.edge.weight})`);
        } else {
            lines.push(`  [${write.surface}] ${write.op} ${write.spec.id}${write.repair ? ` (repair: ${write.repair})` : ''}`);
            lines.push(...JSON.stringify(write.spec, null, 4).split('\n').map(line => `      ${line}`));
        }
        lines.push('');
    }

    return lines;
}

/**
 * @summary Executes a valid decision's write set against an injected graph adapter — the
 * documented write seam. The CLI wires `Memory_GraphService` (the sibling seed script's real
 * path); tests wire a recording fake. Fail-closed: an invalid decision executes NOTHING.
 * @param {Object} options
 * @param {Object} options.decision A decision from {@link decideProvision}
 * @param {Object} options.graph Adapter exposing `upsertGlobalNode(spec)`, `upsertNode(spec)`, `linkNodes(source, target, relationship, weight)`
 * @returns {{valid: Boolean, reason: String|null, executed: Object[]}}
 */
export function executeProvision({decision, graph} = {}) {
    if (!decision || decision.valid !== true) {
        return {valid: false, reason: 'refusing to execute: the decision is missing or invalid', executed: []};
    }

    if (!graph || typeof graph.upsertGlobalNode !== 'function' || typeof graph.upsertNode !== 'function' || typeof graph.linkNodes !== 'function') {
        return {valid: false, reason: 'refusing to execute: the graph adapter must expose upsertGlobalNode, upsertNode and linkNodes', executed: []};
    }

    const executed = [];

    for (const write of decision.writes) {
        if (write.op === 'linkNodes') {
            graph.linkNodes(write.edge.source, write.edge.target, write.edge.relationship, write.edge.weight);
            executed.push({op: write.op, id: `${write.edge.source} -[${write.edge.relationship}]-> ${write.edge.target}`});
        } else {
            graph[write.op](write.spec);
            executed.push({op: write.op, id: write.spec.id});
        }
    }

    return {valid: true, reason: null, executed}
}

/**
 * @summary Post-verify: re-reads persisted state and re-decides — provisioning only counts as
 * successful when the re-decision is zero-op (everything present, contract-clean, edge linked).
 * A commit whose writes did not actually persist is caught here rather than reported as success.
 * @param {Object} options
 * @param {Object} options.sqlite Open better-sqlite3 connection (the graph storage's `db`)
 * @param {Object} options.plan A valid plan from {@link buildProvisionPlan}
 * @param {String[]} [options.rosterIds] Committed-roster ids (test seam)
 * @returns {{valid: Boolean, reason: String|null, remaining: Object[]}}
 */
export function verifyProvisioned({sqlite, plan, rosterIds} = {}) {
    const existing = readExistingState(sqlite, plan),
          decision = decideProvision(rosterIds ? {plan, existing, rosterIds} : {plan, existing});

    if (!decision.valid) {
        return {valid: false, reason: `post-verify re-decision refused: ${decision.reason}`, remaining: []};
    }

    if (!decision.alreadyProvisioned) {
        const remaining = decision.writes.map(write => write.op === 'linkNodes'
            ? `${write.op} ${write.edge.source} -[${write.edge.relationship}]-> ${write.edge.target}`
            : `${write.op} ${write.spec.id}`);

        return {valid: false, reason: `post-verify found ${remaining.length} write(s) still missing — the commit did not fully persist`, remaining};
    }

    return {valid: true, reason: null, remaining: []}
}

/**
 * @summary Parses the CLI argv (pure, hand-rolled by design: unknown flags refuse instead of
 * being silently ignored; the socialName-class flags refuse with the ritual pointer and the
 * engine-class flags refuse with the observation pointer — all part of the tested input
 * contract). Required-field enforcement lives in {@link buildProvisionPlan}; this layer owns
 * flag SYNTAX only.
 * @param {String[]} argv Arguments after the script path (`process.argv.slice(2)`)
 * @returns {{valid: Boolean, reason: String|null, options: Object|null}}
 */
export function parseProvisionArgs(argv = []) {
    const valueFlags = {
        '--display-name'     : 'displayName',
        '--family'           : 'family',
        '--fleet-instance-id': 'fleetInstanceId',
        '--github-username'  : 'githubUsername',
        '--mailbox'          : 'mailbox',
        '--resident-id'      : 'residentId'
    };

    const booleanFlags = {
        '--commit': 'commit',
        '--help'  : 'help'
    };

    const options = {commit: false, help: false};

    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];

        if (SOCIAL_NAME_CLASS_FLAGS.includes(flag)) {
            return {valid: false, reason: `${flag} is rejected by design — Social Names are the post-boot peer-naming ritual (bearer-assented), never seed data`, options: null};
        }

        if (ENGINE_CLASS_FLAGS.includes(flag)) {
            return {valid: false, reason: `${flag} is rejected by design — engine embodiment opens at first OBSERVED runtime evidence (the era layer's follow-up), never from an operator prediction at Day-0`, options: null};
        }

        if (booleanFlags[flag]) {
            options[booleanFlags[flag]] = true;
            continue;
        }

        if (valueFlags[flag]) {
            const value = argv[i + 1];

            if (value === undefined || value.startsWith('--')) {
                return {valid: false, reason: `${flag} requires a value`, options: null};
            }

            options[valueFlags[flag]] = value;
            i++;
            continue;
        }

        return {valid: false, reason: `unknown option '${flag}' — provisioning accepts only: ${[...Object.keys(valueFlags), ...Object.keys(booleanFlags)].join(', ')}`, options: null};
    }

    return {valid: true, reason: null, options}
}

/**
 * @summary Prints the CLI usage block.
 * @returns {void}
 */
function printUsage() {
    console.log('Usage: node ai/scripts/setup/provisionAgentIdentity.mjs --resident-id <s> --family <s>');
    console.log('           [--display-name <s>] [--github-username <s>] [--mailbox <s>]');
    console.log('           [--fleet-instance-id <s>] [--commit]');
    console.log('');
    console.log('  (no flags)  Dry-run — read the live graph READ-ONLY and print the true desired-vs-current delta.');
    console.log('  --commit    Execute the delta via Memory_GraphService, then post-verify by re-read.');
    console.log('');
    console.log('  There is deliberately NO --social-name style flag (Social Names are the post-boot');
    console.log('  naming ritual, never seed data) and NO --model flag (engine embodiment opens at');
    console.log('  first OBSERVED runtime evidence, never from a Day-0 prediction).');
}

/**
 * @summary Prints the follow-up checklist — the committed-file surfaces this script never
 * writes itself.
 * @returns {void}
 */
function printFollowUpChecklist() {
    console.log('[provisionAgentIdentity] R3b follow-up — the roots-onboarding PR must touch:');

    for (const item of R3B_FOLLOW_UP_CHECKLIST) {
        console.log(`  [ ] ${item}`);
    }
}

async function main() {
    const parsed = parseProvisionArgs(process.argv.slice(2));

    if (!parsed.valid) {
        console.error(`[provisionAgentIdentity] FATAL: ${parsed.reason}`);
        printUsage();
        process.exit(1);
    }

    if (parsed.options.help) {
        printUsage();
        return;
    }

    const built = buildProvisionPlan(parsed.options);

    if (!built.valid) {
        console.error(`[provisionAgentIdentity] FATAL: ${built.reason}`);
        printUsage();
        process.exit(1);
    }

    const {plan} = built;

    console.log(`[provisionAgentIdentity] resident: ${plan.residentId} (family: ${plan.family}${plan.fleetInstanceId ? `, fleet instance: ${plan.fleetInstanceId}` : ''})`);
    console.log(`[provisionAgentIdentity] mode:     ${parsed.options.commit ? 'COMMIT' : 'DRY-RUN (read-only)'}`);
    console.log('');

    if (!parsed.options.commit) {
        // Dry-run reads the live graph READ-ONLY through the owning config leaf and writes
        // NOTHING — the rendered delta is the same decision --commit would execute.
        const {default: AiConfig} = await import('../../config.mjs');
        const {existsSync}        = await import('node:fs');
        const dbPath              = AiConfig.storagePaths.graph;

        let existing = {identityRow: null, wakeRows: [], subscribesToEdges: []};

        if (existsSync(dbPath)) {
            const {default: Database} = await import('better-sqlite3');
            const sqlite              = new Database(dbPath, {readonly: true});

            try {
                existing = readExistingState(sqlite, plan);
            } finally {
                sqlite.close();
            }
        } else {
            console.log(`[provisionAgentIdentity] no live graph at ${dbPath} — nothing exists yet; the delta below is the full desired set.`);
            console.log('');
        }

        const decision = decideProvision({plan, existing});

        if (!decision.valid) {
            console.error(`[provisionAgentIdentity] FATAL: ${decision.reason}`);

            for (const divergence of decision.divergences) {
                console.error(`  [DIVERGENT] ${divergence.surface}.${divergence.field}: existing '${divergence.existing}' vs planned '${divergence.planned}'`);
            }

            process.exit(1);
        }

        console.log(renderDecision(plan, decision).join('\n'));
        printFollowUpChecklist();
        console.log('');
        console.log('[provisionAgentIdentity] DRY-RUN complete. No changes applied. Re-run with --commit to execute.');
        return;
    }

    // Side-effect half — the sibling seed script's write path, imported lazily so only
    // --commit ever boots services.
    const {Memory_GraphService} = await import('../../services.mjs');

    console.log('[provisionAgentIdentity] Bootstrapping Memory Graph Service...');
    await Memory_GraphService.initAsync();

    const sqlite = Memory_GraphService.db && Memory_GraphService.db.storage && Memory_GraphService.db.storage.db;

    if (!sqlite) {
        console.error('[provisionAgentIdentity] FATAL: graph SQLite storage is not mounted — refusing to write.');
        process.exit(1);
    }

    const existing = readExistingState(sqlite, plan);
    const decision = decideProvision({plan, existing});

    if (!decision.valid) {
        console.error(`[provisionAgentIdentity] FATAL: ${decision.reason}`);

        for (const divergence of decision.divergences) {
            console.error(`  [DIVERGENT] ${divergence.surface}.${divergence.field}: existing '${divergence.existing}' vs planned '${divergence.planned}'`);
        }

        process.exit(1);
    }

    console.log(renderDecision(plan, decision).join('\n'));

    if (decision.alreadyProvisioned) {
        console.log(`[provisionAgentIdentity] ${plan.residentId} is already provisioned — no changes applied.`);
        printFollowUpChecklist();
        process.exit(0);
    }

    const execution = executeProvision({decision, graph: Memory_GraphService});

    if (!execution.valid) {
        console.error(`[provisionAgentIdentity] FATAL: ${execution.reason}`);
        process.exit(1);
    }

    for (const write of execution.executed) {
        console.log(`  [WROTE] ${write.op} ${write.id}`);
    }

    // Post-verify: success is only reported when a re-read re-decision is zero-op.
    const verification = verifyProvisioned({sqlite, plan});

    if (!verification.valid) {
        console.error(`[provisionAgentIdentity] FATAL: ${verification.reason}`);

        for (const remaining of verification.remaining) {
            console.error(`  [MISSING] ${remaining}`);
        }

        process.exit(1);
    }

    console.log('');
    console.log(`[provisionAgentIdentity] COMMIT complete + post-verified: ${execution.executed.length} write(s) for ${plan.residentId}.`);
    printFollowUpChecklist();
    process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('[provisionAgentIdentity] FATAL:', err);
        process.exit(1);
    });
}
