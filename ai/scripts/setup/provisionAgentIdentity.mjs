#!/usr/bin/env node
import path                                                                   from 'node:path';
import {fileURLToPath}                                                        from 'node:url';
import {IDENTITIES, TRUST_TIERS}                                              from '../../graph/identityRoots.mjs';
import {createEmbodiedEpisodeNode, createIdentityStateNode, validateEraChain} from '../../graph/identitySchema.mjs';

/**
 * @module ai/scripts/setup/provisionAgentIdentity
 * @summary Day-0 agent identity provisioning (R3a of the peer-onboarding rail): builds and —
 * under `--commit` — persists the Memory Core `AgentIdentity` node, the era anchor
 * (`IdentityState` + first `EmbodiedEpisode`, via the identitySchema builders), and the Day-0
 * wake subscription for ONE new resident. Dry-run by default; the dry-run prints exactly the
 * write set `--commit` would execute.
 *
 * **Tier-2 decision — the era chain is keyed by INSTANCE ID, not GitHub login.** The fleet
 * registry explicitly supports multiple instance ids per GitHub account
 * (`FleetRegistryService.register`: "pass an explicit id to register multiple instances per
 * user"), so per-instance engine truth (which model embodies WHICH instance, since when) only
 * exists at the instance grain — keying eras by GitHub login would collapse same-account
 * siblings into one false chain. Local/reversible (undoable in 1 commit), decided and
 * documented here per the escalation ladder; @neo-gpt pressure-tests this key choice at review.
 *
 * **Why the input surface has NO socialName-class parameter (load-bearing):** Social Names are
 * the post-boot peer-naming ritual — peer-sketched, bearer-assented, peer-vetoable,
 * operator-confirmed. They are NEVER seed data: a name provisioned before the bearer can assent
 * would fabricate the assent. Day-0 residents get the handle-derived display form only; the
 * `IdentityState.socialLayer` ships empty by construction, and any socialName-class input
 * (flag or option key) is rejected loudly instead of ignored.
 *
 * **Anti-fabrication contract (mirrors `identityRootsMigration`):** the first era's `since` is
 * the ACTUAL provisioning timestamp — never an earlier date, never backfill. A brand-new
 * resident has no earlier history on record, so there is nothing to backfill; committed-roster
 * residents are refused outright (their seed era belongs to `identityRootsMigration` at
 * `MIGRATION_EPOCH`, and a Day-0 era here would fabricate an onboarding date). Era capabilities
 * carry only a provenance note — capability FACTS follow via the source-cited `ModelStats.md`
 * discipline, not provisioning-time guesses.
 *
 * **Write path (side-effect half, `--commit` only):** the sibling seed script's real path —
 * `Memory_GraphService` from `ai/services.mjs` (`initAsync` → `upsertGlobalNode` for the
 * identity substrate, matching `GraphService.initAsync`'s own roster seeding, + `upsertNode` /
 * `linkNodes` for the wake route, matching `WakeSubscriptionService.subscribe`'s durable
 * shape). Services are imported lazily inside the commit branch so dry-run touches NOTHING.
 * All writes flow through the injectable {@link executeProvision} seam for testability.
 *
 * **Why the Day-0 wake route is `mcp-notifications` (Shape A):** `bridge-daemon` (Shape C)
 * requires boot-environment facts (`appName`, per-instance address) that do not exist at
 * provisioning time — fabricating them is exactly the hardcoded-route rot
 * `migrateWakeSubscriptions` exists to clean up. Shape A is the only metadata-free channel, so
 * the resident has a live wake surface from minute zero; the runtime
 * `manage_wake_subscription {action: 'bootstrap'}` self-registration upgrades the route from
 * the real boot envelope.
 *
 * Everything decision-shaped here is pure and fail-closed: builders/validators return
 * `{valid, reason, ...}` and never throw; an invalid plan, a divergent existing state, or a
 * corrupt era chain refuses loudly and writes NOTHING. This script never writes committed
 * files — the five committed-file surfaces are the R3b follow-up PR
 * ({@link R3B_FOLLOW_UP_CHECKLIST}), printed on every successful run.
 *
 * **Usage**:
 *   node ai/scripts/setup/provisionAgentIdentity.mjs --instance-id <s> --family <s> --model <s>
 *       [--display-name <s>] [--github-username <s>] [--mailbox <s>]           # dry-run (default)
 *   node ai/scripts/setup/provisionAgentIdentity.mjs ... --commit               # execute
 *   node ai/scripts/setup/provisionAgentIdentity.mjs --help                     # print usage
 */

const __filename = fileURLToPath(import.meta.url);

/**
 * @summary The socialName-class option keys the provisioning input surface REJECTS. Social
 * Names are the post-boot peer-naming ritual (bearer-assented), never seed data — rejecting instead
 * of ignoring keeps the guard visible to callers.
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
 * @summary The R3b follow-up checklist: the five committed-file surfaces a roots-onboarding PR
 * must touch AFTER Day-0 provisioning. This script NEVER writes committed files itself.
 * @type {ReadonlyArray<String>}
 */
export const R3B_FOLLOW_UP_CHECKLIST = Object.freeze([
    'ai/graph/identityRoots.mjs — add the resident\'s IDENTITIES roster entry (Layer-1 operational fields; social layer stays empty until the naming ritual)',
    'README.md — add the maintainer roster row (Name / Maintainer / Role / Identity table)',
    'learn/agentos/ModelStats.md — add the resident\'s capability section (source-cited per ADR 0012 §2.5; capability facts live HERE, never guessed at provisioning)',
    'ai/graph/identityRootsMigration.mjs — check REGISTRY_MODEL_DESIGNATIONS + the MIGRATION_EPOCH note (post-epoch onboarding must NOT retro-seed; the Day-0 era already opened at onboarding time)',
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
 * @summary Derives the handle-derived DISPLAY form from an instance id — the operational
 * default a resident keeps until (and unless) the naming ritual grants a Social Name.
 * E.g. '@neo-fable-clio' → 'Neo Fable Clio'.
 * @param {String} instanceId The `@`-prefixed instance id
 * @returns {String}
 */
export function deriveDisplayForm(instanceId) {
    return instanceId
        .replace(/^@/, '')
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/**
 * @summary Builds the frozen Day-0 provisioning plan (the PURE half): the operational
 * `AgentIdentity` write spec (Layer-1 fields only), the era anchor via the identitySchema
 * builders (`since` = the actual provisioning timestamp, no backfill), and the Day-0 wake
 * route. `validateEraChain` MUST pass here — an invalid chain refuses before any write path
 * can even see the plan. The input surface has NO socialName-class parameter (module JSDoc);
 * socialName-class keys are rejected loudly.
 * @param {Object} options
 * @param {String} options.instanceId The instance id — the era-chain key (Tier-2 decision, module JSDoc)
 * @param {String} options.family Model family (e.g. 'claude' | 'gpt' | 'gemini')
 * @param {String} options.model The embodying model designation (era-owned fact; lives on the episode)
 * @param {String} [options.displayName] Handle-derived display form override — operational display, NOT a Social Name
 * @param {String} [options.githubUsername] GitHub login (defaults to the instance id)
 * @param {String} [options.mailbox] A2A mailbox address (defaults to the instance id)
 * @param {Date|String} [options.now] Clock override for deterministic tests; defaults to the real now
 * @returns {{valid: Boolean, reason: String|null, plan: Object|null}}
 */
export function buildProvisionPlan(options = {}) {
    const leaked = SOCIAL_NAME_CLASS_KEYS.filter(key => key in options);

    if (leaked.length > 0) {
        return {valid: false, reason: `socialName-class inputs are rejected by design: ${leaked.join(', ')} — Social Names are the post-boot #11240 naming ritual (bearer-assented), never seed data`, plan: null};
    }

    const instance = normalizeHandle(options.instanceId, '--instance-id');

    if (!instance.valid) {
        return {valid: false, reason: instance.reason, plan: null};
    }

    if (typeof options.family !== 'string' || !/^[a-z][a-z0-9-]*$/.test(options.family)) {
        return {valid: false, reason: `--family must be a lowercase family token (e.g. 'claude') — received '${String(options.family)}'`, plan: null};
    }

    if (typeof options.model !== 'string' || options.model.trim() === '') {
        return {valid: false, reason: '--model requires a non-empty model designation', plan: null};
    }

    if (options.displayName !== undefined && (typeof options.displayName !== 'string' || options.displayName.trim() === '')) {
        return {valid: false, reason: '--display-name, when given, requires a non-empty string', plan: null};
    }

    const github = normalizeHandle(options.githubUsername === undefined ? instance.handle : options.githubUsername, '--github-username');

    if (!github.valid) {
        return {valid: false, reason: github.reason, plan: null};
    }

    const mailbox = normalizeHandle(options.mailbox === undefined ? instance.handle : options.mailbox, '--mailbox');

    if (!mailbox.valid) {
        return {valid: false, reason: mailbox.reason, plan: null};
    }

    const nowMs = Date.parse(options.now === undefined ? new Date().toISOString() : options.now);

    if (!Number.isFinite(nowMs)) {
        return {valid: false, reason: `the provisioning timestamp must be parseable — received '${String(options.now)}' (eras record the ACTUAL onboarding time; no backfill)`, plan: null};
    }

    const instanceId  = instance.handle,
          since       = new Date(nowMs).toISOString(),
          displayForm = options.displayName === undefined ? deriveDisplayForm(instanceId) : options.displayName.trim(),
          model       = options.model.trim();

    // The era anchor — built ONLY through the schema builders, never hand-shaped.
    const identityState = createIdentityStateNode({identityKey: instanceId});

    if (!identityState.valid) {
        return {valid: false, reason: identityState.reason, plan: null};
    }

    const episode = createEmbodiedEpisodeNode({
        identityKey : instanceId,
        model,
        family      : options.family,
        since,
        capabilities: {provenance: 'day-0 onboarding (facts recorded at provisioning time; no earlier history exists — nothing to backfill)'}
    });

    if (!episode.valid) {
        return {valid: false, reason: episode.reason, plan: null};
    }

    // Fail-closed gate: an invalid chain refuses BEFORE any write path sees the plan.
    const chain = validateEraChain(identityState.node, [episode.node]);

    if (!chain.valid) {
        return {valid: false, reason: `era chain failed validation — nothing will be written: ${chain.reason}`, plan: null};
    }

    const handleBody = instanceId.slice(1);

    const writeSpecs = Object.freeze({
        // The operational Memory Core node (the addressable A2A / wake / permission surface).
        // Layer-1 operational fields ONLY: name is the handle-derived display form, NOT a
        // Social Name; era-owned facts (model, capabilities) live on the episode; modelFamily
        // stays flat here because the CURRENT operational surface reads it flat — the
        // flat-field retirement leaf migrates readers onto the era view.
        identity: Object.freeze({
            id         : instanceId,
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
                    canonicalIdentityId      : instanceId,
                    requiredGithubLogin      : github.handle,
                    requiredA2aMailboxAddress: mailbox.handle
                }),
                participationStatus: 'active',
                statusReason       : null,
                authority          : null,
                since              : null,
                reactivationTrigger: null,
                createdAt          : since
            })
        }),
        // The era anchor's graph shape (schema-node fields under `properties`, matching how
        // GraphService persists `{id, label, properties}` rows).
        identityState: Object.freeze({
            id        : identityState.node.id,
            type      : identityState.node.type,
            properties: Object.freeze({
                identityKey: instanceId,
                // Empty BY CONSTRUCTION — the naming ritual writes here post-boot, never provisioning.
                socialLayer: Object.freeze({})
            })
        }),
        episode: Object.freeze({
            id        : episode.node.id,
            type      : episode.node.type,
            properties: Object.freeze({
                identityKey : instanceId,
                model,
                family      : options.family,
                since,
                until       : null,
                capabilities: episode.node.capabilities
            })
        }),
        // The durable wake route — the exact node + edge shape WakeSubscriptionService.subscribe
        // persists, on the only channel that requires no fabricated harness metadata.
        wakeSubscription: Object.freeze({
            id        : `WAKE_SUB:day0-${handleBody}`,
            type      : 'WAKE_SUBSCRIPTION',
            properties: Object.freeze({
                agentIdentity        : instanceId,
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
            source      : instanceId,
            target      : `WAKE_SUB:day0-${handleBody}`,
            relationship: 'SUBSCRIBES_TO',
            weight      : 1.0
        })
    });

    return {
        valid : true,
        reason: null,
        plan  : Object.freeze({
            instanceId,
            family        : options.family,
            model,
            displayForm,
            githubUsername: github.handle,
            mailbox       : mailbox.handle,
            since,
            schema        : Object.freeze({identityState: identityState.node, episode: episode.node}),
            writeSpecs
        })
    }
}

/**
 * @summary The complete ordered write set for a plan — the single source both the dry-run
 * rendering and the commit decision filter from, so "what dry-run prints" and "what --commit
 * writes" cannot drift.
 * @param {Object} plan A valid plan from {@link buildProvisionPlan}
 * @returns {Object[]} Ordered ops `{surface, op, spec|edge}`
 */
export function planWrites(plan) {
    return [
        {surface: 'identity',      op: 'upsertGlobalNode', spec: plan.writeSpecs.identity},
        {surface: 'identityState', op: 'upsertGlobalNode', spec: plan.writeSpecs.identityState},
        {surface: 'era',           op: 'upsertGlobalNode', spec: plan.writeSpecs.episode},
        {surface: 'wake',          op: 'upsertNode',       spec: plan.writeSpecs.wakeSubscription},
        {surface: 'wake',          op: 'linkNodes',        edge: plan.writeSpecs.wakeEdge}
    ];
}

/**
 * @summary Renders the exact write plan as printable lines — the dry-run output IS the write
 * set (it is derived from the same {@link planWrites} the commit path filters).
 * @param {Object} plan A valid plan from {@link buildProvisionPlan}
 * @returns {String[]}
 */
export function renderWritePlan(plan) {
    const lines = [
        `[provisionAgentIdentity] write plan for ${plan.instanceId} (era key: instance id; since: ${plan.since})`,
        ''
    ];

    for (const write of planWrites(plan)) {
        if (write.op === 'linkNodes') {
            lines.push(`  [${write.surface}] linkNodes ${write.edge.source} -[${write.edge.relationship}]-> ${write.edge.target} (weight ${write.edge.weight})`);
        } else {
            lines.push(`  [${write.surface}] ${write.op} ${write.spec.id}`);
            lines.push(...JSON.stringify(write.spec, null, 4).split('\n').map(line => `      ${line}`));
        }
        lines.push('');
    }

    return lines;
}

/**
 * @summary Parses a graph `Nodes` row's JSON payload; fail-closed on unparseable data.
 * @param {Object|undefined} row `{id, data}` from SQLite, or undefined when absent
 * @returns {Object|null} `{id, label, properties}`, `{id, parseError}`, or null when absent
 */
export function parseNodeRow(row) {
    if (!row) return null;

    try {
        const node = JSON.parse(row.data);

        return {id: row.id, label: node.label, properties: node.properties || {}}
    } catch (error) {
        return {id: row.id, parseError: error.message}
    }
}

/**
 * @summary Reads the existing graph state a provisioning decision needs — the side-effect
 * half's ONLY read surface, kept raw-SQLite (the same durable-row idiom the wake substrate and
 * the sibling seed script peek through) so it is testable against an in-memory database.
 * @param {Object} sqlite Open better-sqlite3 connection (the graph storage's `db`)
 * @param {Object} plan A valid plan from {@link buildProvisionPlan}
 * @returns {{identityRow: Object|null, identityStateRow: Object|null, episodeRows: Object[], wakeRows: Object[]}}
 */
export function readExistingState(sqlite, plan) {
    const byId = id => parseNodeRow(sqlite.prepare('SELECT id, data FROM Nodes WHERE id = ? LIMIT 1').get(id));

    const byLabelAndKey = (label, keyPath) => sqlite.prepare(`
        SELECT id, data FROM Nodes
        WHERE json_extract(data, '$.label') = ?
          AND json_extract(data, '$.properties.${keyPath}') = ?
    `).all(label, plan.instanceId).map(parseNodeRow);

    return {
        identityRow     : byId(plan.instanceId),
        identityStateRow: byId(plan.writeSpecs.identityState.id),
        episodeRows     : byLabelAndKey('EmbodiedEpisode', 'identityKey'),
        wakeRows        : byLabelAndKey('WAKE_SUBSCRIPTION', 'agentIdentity')
    };
}

/**
 * @summary The pure idempotence decision: per surface `create` (absent) / `exists` (present +
 * equivalent) / divergence (present + conflicting — the WHOLE run refuses, loud diff, nothing
 * written). Existing-but-matching surfaces are skipped so a crash-interrupted `--commit`
 * completes on re-run and a second run changes NOTHING. Fail-closed throughout: a corrupt
 * existing era chain, an unparseable row, or a committed-roster resident (whose seed era
 * belongs to `identityRootsMigration`, not a Day-0 era) refuses outright.
 * @param {Object} options
 * @param {Object} options.plan A valid plan from {@link buildProvisionPlan}
 * @param {Object} options.existing State from {@link readExistingState}
 * @param {String[]} [options.rosterIds] Committed-roster ids (test seam; defaults to `identityRoots.IDENTITIES`)
 * @returns {{valid: Boolean, reason: String|null, alreadyProvisioned: Boolean, surfaces: Object, divergences: Object[], writes: Object[]}}
 */
export function decideProvision({plan, existing = {}, rosterIds = IDENTITIES.map(identity => identity.id)} = {}) {
    const refuse = reason => ({valid: false, reason, alreadyProvisioned: false, surfaces: {}, divergences: [], writes: []});

    if (!plan || !plan.writeSpecs) {
        return refuse('decideProvision requires a valid plan from buildProvisionPlan');
    }

    const identityRow      = existing.identityRow || null,
          identityStateRow = existing.identityStateRow || null,
          episodeRows      = existing.episodeRows || [],
          wakeRows         = existing.wakeRows || [],
          divergences      = [];

    for (const row of [identityRow, identityStateRow, ...episodeRows, ...wakeRows]) {
        if (row && row.parseError) {
            return refuse(`existing graph row '${row.id}' is unparseable (${row.parseError}) — refusing to decide against corrupt state`);
        }
    }

    // --- identity surface -------------------------------------------------------------------
    let identityAction = 'create';

    if (identityRow) {
        identityAction = 'exists';

        const props = identityRow.properties;

        if (identityRow.label !== 'AgentIdentity') {
            divergences.push({surface: 'identity', field: 'label', existing: identityRow.label, planned: 'AgentIdentity'});
        }
        if (props.accountType !== 'agent') {
            divergences.push({surface: 'identity', field: 'accountType', existing: props.accountType, planned: 'agent'});
        }
        if (props.githubLogin !== plan.githubUsername) {
            divergences.push({surface: 'identity', field: 'githubLogin', existing: props.githubLogin, planned: plan.githubUsername});
        }
        if (props.modelFamily !== plan.family) {
            divergences.push({surface: 'identity', field: 'modelFamily', existing: props.modelFamily, planned: plan.family});
        }
    }

    // --- era anchor surfaces ----------------------------------------------------------------
    let identityStateAction = identityStateRow ? 'exists' : 'create',
        eraAction           = 'create';

    if (identityStateRow && identityStateRow.properties.identityKey !== plan.instanceId) {
        divergences.push({surface: 'identityState', field: 'identityKey', existing: identityStateRow.properties.identityKey, planned: plan.instanceId});
    }

    if (episodeRows.length > 0) {
        if (!identityStateRow) {
            return refuse(`${episodeRows.length} EmbodiedEpisode row(s) exist for ${plan.instanceId} without their IdentityState anchor — corrupt chain; refusing`);
        }

        // Reconstruct the persisted rows into schema shapes and re-validate — consumers of a
        // provisioned chain rely on this validator, so provisioning refuses to extend a chain
        // that no longer validates.
        const anchor   = {id: identityStateRow.id, type: identityStateRow.label, identityKey: identityStateRow.properties.identityKey};
        const episodes = episodeRows.map(row => ({id: row.id, type: row.label, ...row.properties}));
        const chain    = validateEraChain(anchor, episodes);

        if (!chain.valid) {
            return refuse(`existing era chain for ${plan.instanceId} is invalid (${chain.reason}) — refusing to write against corrupt state`);
        }

        eraAction = 'exists';

        const openEra = episodes.find(era => era.until === null);

        if (openEra.model !== plan.model) {
            divergences.push({surface: 'era', field: 'model', existing: openEra.model, planned: plan.model,
                note: 'a model change is an era MIGRATION (identitySchema.migrateEra closes the head and appends), never re-provisioning'});
        }
        if (openEra.family !== plan.family) {
            divergences.push({surface: 'era', field: 'family', existing: openEra.family, planned: plan.family,
                note: 'a family swap is a NEW era on the SAME identity — route it through era migration, never re-provisioning'});
        }
    }

    // Committed-roster residents receive their seed era from identityRootsMigration at
    // MIGRATION_EPOCH — opening a Day-0 era here would fabricate an onboarding date.
    if (eraAction === 'create' && rosterIds.includes(plan.instanceId)) {
        return refuse(`${plan.instanceId} is a committed-roster resident (ai/graph/identityRoots.mjs) — its seed era belongs to identityRootsMigration, not Day-0 provisioning; refusing to fabricate an onboarding date`);
    }

    // --- wake surface -------------------------------------------------------------------------
    // Any active same-trigger route owned by the identity counts as provisioned — including a
    // richer self-registered runtime route; Day-0 must never duplicate wake fanout beside it.
    const wakeAction = wakeRows.some(row =>
        (row.properties.status || 'active') === 'active' &&
        row.properties.trigger === WAKE_SUBSCRIPTION_DEFAULTS.trigger
    ) ? 'exists' : 'create';

    const surfaces = {identity: identityAction, identityState: identityStateAction, era: eraAction, wake: wakeAction};

    if (divergences.length > 0) {
        return {
            valid             : false,
            reason            : `existing state diverges from the plan on ${divergences.length} field(s) — nothing will be written`,
            alreadyProvisioned: false,
            surfaces,
            divergences,
            writes            : []
        };
    }

    const writes = planWrites(plan).filter(write => surfaces[write.surface] === 'create');

    return {
        valid             : true,
        reason            : null,
        alreadyProvisioned: writes.length === 0,
        surfaces,
        divergences       : [],
        writes
    };
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
 * @summary Parses the CLI argv (pure, hand-rolled by design: unknown flags refuse instead of
 * being silently ignored, and the socialName-class flags refuse with the ritual pointer —
 * both are part of the tested input contract). Required-field enforcement lives in
 * {@link buildProvisionPlan}; this layer owns flag SYNTAX only.
 * @param {String[]} argv Arguments after the script path (`process.argv.slice(2)`)
 * @returns {{valid: Boolean, reason: String|null, options: Object|null}}
 */
export function parseProvisionArgs(argv = []) {
    const valueFlags = {
        '--display-name'   : 'displayName',
        '--family'         : 'family',
        '--github-username': 'githubUsername',
        '--instance-id'    : 'instanceId',
        '--mailbox'        : 'mailbox',
        '--model'          : 'model'
    };

    const booleanFlags = {
        '--commit': 'commit',
        '--help'  : 'help'
    };

    const options = {commit: false, help: false};

    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];

        if (SOCIAL_NAME_CLASS_FLAGS.includes(flag)) {
            return {valid: false, reason: `${flag} is rejected by design — Social Names are the post-boot #11240 naming ritual (bearer-assented), never seed data`, options: null};
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
    console.log('Usage: node ai/scripts/setup/provisionAgentIdentity.mjs --instance-id <s> --family <s> --model <s>');
    console.log('           [--display-name <s>] [--github-username <s>] [--mailbox <s>] [--commit]');
    console.log('');
    console.log('  (no flags)  Dry-run — print the exact write plan without touching the graph.');
    console.log('  --commit    Execute the writes via Memory_GraphService (idempotent; loud diff on divergence).');
    console.log('');
    console.log('  There is deliberately NO --social-name style flag: Social Names are the post-boot');
    console.log('  #11240 naming ritual, never seed data.');
}

/**
 * @summary Prints the R3b follow-up checklist — the committed-file surfaces this script never
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

    console.log(`[provisionAgentIdentity] instance: ${plan.instanceId} (family: ${plan.family}, model: ${plan.model})`);
    console.log(`[provisionAgentIdentity] mode:     ${parsed.options.commit ? 'COMMIT' : 'DRY-RUN'}`);
    console.log('');

    if (!parsed.options.commit) {
        // Dry-run touches NOTHING — no services import, no graph read, no write.
        console.log(renderWritePlan(plan).join('\n'));
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
            console.error(`  [DIVERGENT] ${divergence.surface}.${divergence.field}: existing '${divergence.existing}' vs planned '${divergence.planned}'${divergence.note ? ` — ${divergence.note}` : ''}`);
        }

        process.exit(1);
    }

    for (const [surface, action] of Object.entries(decision.surfaces)) {
        console.log(`  [${action === 'exists' ? 'EXISTS' : 'CREATE'}] ${surface}`);
    }
    console.log('');

    if (decision.alreadyProvisioned) {
        console.log(`[provisionAgentIdentity] ${plan.instanceId} is already provisioned — no changes applied.`);
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

    console.log('');
    console.log(`[provisionAgentIdentity] COMMIT complete: ${execution.executed.length} write(s) for ${plan.instanceId}.`);
    printFollowUpChecklist();
    process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('[provisionAgentIdentity] FATAL:', err);
        process.exit(1);
    });
}
