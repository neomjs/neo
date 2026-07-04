import {validateBlueprint, validateMutation} from './blueprintSchema.mjs';

/**
 * @module AgentOS.view.create.util.acceptPath
 * @summary The accept path: carries an ACCEPTED blueprint into a live component through the ONE
 * create path, and keeps the created-instance registry truthful over the create → mutate →
 * dispose lifecycle.
 *
 * Join, never fork: widgets enter the stage via the container `add → insert` seam — the same
 * seam a Neural-Link `create_component` drives — so provenance projection works identically for
 * in-app and external creations. This module therefore never instantiates directly; it builds a
 * stage-insertable config (`ntype`, wire-safe — module references cannot cross the Neural Link)
 * and calls the injected stage's `add()`.
 *
 * Accept-side validation runs the SAME imported `validateBlueprint` the emit side runs — the
 * fail-closed-both-sides contract as two call sites of ONE validator, never a second rule set.
 * Every failure returns the pipeline's bounded refusal shape `{accepted, reason, stage}`; nothing
 * in this module throws into a render path.
 */

/**
 * @summary The accept path's failure stages, extending the route's vocabulary.
 * @type {Object}
 */
export const ACCEPT_STAGES = Object.freeze({
    ACCEPT  : 'accept',
    MUTATION: 'mutation',
    DISPOSE : 'dispose'
});

/**
 * @summary The DEFAULT component resolution: the neo core instance manager. Every created
 * component self-registers by id (`afterSetId` → `Neo.manager.Instance`), and the materializer
 * stamps `id: instanceId`, so `Neo.get(instanceId)` returns the live `Neo.core.Base` instance or
 * null — instance shape is a core-contract guarantee on this path, never a hope. Passing a custom
 * `resolveComponent` remains supported as a TEST seam only; production callers should not
 * override it.
 * @param {String} instanceId
 * @returns {Neo.core.Base|null}
 */
function resolveViaInstanceManager(instanceId) {
    return (typeof Neo !== 'undefined' && typeof Neo.get === 'function') ? (Neo.get(instanceId) || null) : null
}

/**
 * @summary Schema-keyed materializers — the render half of the schema registry: `materialize`
 * builds the stage-insertable component config from an accepted blueprint; `apply` writes an
 * accepted MERGED blueprint onto the live component. Adding a widget type here is ONE entry,
 * keyed by the exact same schema id the validator registry uses; a schema present in one
 * registry and absent here is a coverage defect the accept path refuses loudly.
 * @type {Object}
 */
export const SCHEMA_MATERIALIZERS = Object.freeze({
    'grid@1': Object.freeze({
        /**
         * Generalizes the shipped first-widget grid mapping: wire-safe `ntype`, columns from the
         * blueprint's `{field, text}` pairs, an inline store with string fields derived from the
         * same columns, data as the blueprint rows.
         * @param {Object} blueprint Accepted `grid@1` blueprint
         * @param {Object} identity
         * @param {String} identity.instanceId
         * @returns {Object} stage-insertable component config
         */
        materialize(blueprint, {instanceId}) {
            const columns = blueprint.config.columns.map(column => ({dataField: column.field, text: column.text}));

            return {
                // id + reference both set to the instanceId (the shipped first-widget parity):
                // the id makes the instance resolvable via the core instance manager
                // (Neo.get); the reference keeps container-scoped getReference() lookups working
                id       : instanceId,
                ntype    : 'grid-container',
                reference: instanceId,
                title    : blueprint.title,
                flex     : 1,
                columns,
                ...(blueprint.config.height !== undefined ? {height: blueprint.config.height} : {}),
                ...(blueprint.config.width  !== undefined ? {width : blueprint.config.width}  : {}),
                store: {
                    model: {fields: columns.map(column => ({name: column.dataField, type: 'String'}))},
                    data : blueprint.data
                },
                // provenance stamp: the insert-side registrar reads this to write the registry
                // record at the same moment the provenance projection fires; external
                // create_component inserts carry no stamp and are untouched by the registrar
                blueprintMeta: {instanceId, schema: blueprint.schema, title: blueprint.title, blueprintSnapshot: blueprint}
            }
        },
        /**
         * Applies the merged blueprint through neo core's batched mutation path: ONE
         * `component.set()` call for the component-level configs (the EffectManager pauses,
         * every beforeSet/afterSet hook sees the complete new value set, bindings/effects
         * cascade once), then a single store-level data assignment. Never a chain of direct
         * property writes — each of those fires its own reactive cascade.
         * @param {Neo.core.Base} component The live grid instance
         * @param {Object} merged The validator's merged blueprint
         */
        apply(component, merged) {
            component.set({
                title: merged.title,
                ...(merged.config.height !== undefined ? {height: merged.config.height} : {}),
                ...(merged.config.width  !== undefined ? {width : merged.config.width}  : {})
            });

            component.store.data = merged.data
        }
    })
});

/**
 * @summary Accepts a blueprint into the stage: validates it on the accept side (same validator,
 * second call site), materializes the wire-safe config, and routes it through the injected
 * stage's `add()` — the ONE create path. Registration happens on the stage's `insert` event via
 * {@link createInsertRegistrar}, never here — the registry becomes truthful at the same moment
 * the provenance projection fires.
 * @param {Object} options
 * @param {Object} options.blueprint The route-accepted blueprint
 * @param {String} options.instanceId Caller-assigned unique instance id
 * @param {Object} options.stage The live stage container (must expose `add`)
 * @param {Object} [options.registry] The CreatedInstances singleton. When provided, the id is
 *   pre-checked for uniqueness BEFORE insertion so the insert-side registrar cannot refuse after
 *   the component is already in the stage — closing the stage-truth vs registry-truth gap. Omit
 *   only when the caller otherwise guarantees id uniqueness.
 * @returns {{accepted: Boolean, config: Object|null, reason: String|null, stage: String|null}}
 */
export function acceptBlueprint({blueprint, instanceId, stage, registry} = {}) {
    if (typeof instanceId !== 'string' || instanceId.trim() === '') {
        return {accepted: false, config: null, reason: 'accept requires a non-empty string instanceId', stage: ACCEPT_STAGES.ACCEPT};
    }

    if (!stage || typeof stage.add !== 'function') {
        return {accepted: false, config: null, reason: 'no live stage injected — the accept path never creates outside the stage seam', stage: ACCEPT_STAGES.ACCEPT};
    }

    const validation = validateBlueprint(blueprint);

    if (!validation.accepted) {
        return {accepted: false, config: null, reason: validation.reason, stage: ACCEPT_STAGES.ACCEPT};
    }

    const materializer = SCHEMA_MATERIALIZERS[blueprint.schema];

    if (!materializer) {
        return {accepted: false, config: null, reason: `schema "${blueprint.schema}" validates but has no registered materializer — registry coverage defect`, stage: ACCEPT_STAGES.ACCEPT};
    }

    // Refuse a duplicate id BEFORE touching the stage: the insert-side registrar would refuse
    // registration for an already-known id, but only after the component is already inserted —
    // leaving stage truth and registry truth diverged while the caller saw success. Pre-checking
    // here makes registration-blocking refusal part of the accept outcome, so a truthful insert is
    // the only insert that happens.
    if (registry?.resolveTarget?.({instanceId})) {
        return {accepted: false, config: null, reason: `instanceId "${instanceId}" is already registered — one record per instance`, stage: ACCEPT_STAGES.ACCEPT};
    }

    const config = materializer.materialize(blueprint, {instanceId});

    stage.add(config);

    return {accepted: true, config, reason: null, stage: null}
}

/**
 * @summary Builds the stage `insert` observer that writes the registry record for
 * blueprint-created components. Inserts without a provenance stamp (external
 * `create_component`, static items) are ignored — the registrar only records what the accept
 * path materialized.
 * @param {Object} options
 * @param {Object} options.registry The CreatedInstances singleton (or a double in tests)
 * @returns {Function} `({item}) => {accepted, reason, record}|null`
 */
export function createInsertRegistrar({registry}) {
    return function onStageInsert({item} = {}) {
        const meta = item?.blueprintMeta;

        if (!meta) return null;

        return registry.registerCreated({
            instanceId       : meta.instanceId,
            blueprintSchema  : meta.schema,
            title            : meta.title,
            blueprintSnapshot: meta.blueprintSnapshot,
            paneRef          : item.reference || null
        })
    }
}

/**
 * @summary Routes a follow-up mutation: pulls the current snapshot from the registry, runs the
 * shared merge-then-validate contract, applies the MERGED blueprint to the live component via
 * the schema's applier, then records the outcome. The registry snapshot is the current-blueprint
 * argument — no surface ever hand-merges.
 * @param {Object} options
 * @param {String} options.instanceId
 * @param {Object} options.mutation Partial `{title?, config?, data?}`
 * @param {Object} options.registry The CreatedInstances singleton
 * @param {Function} [options.resolveComponent] `(instanceId) => live component|null`; defaults to
 *   the core instance manager (`Neo.get`) — override only as a test seam
 * @returns {{accepted: Boolean, reason: String|null, stage: String|null, blueprint: Object|null}}
 */
export function mutateInstance({instanceId, mutation, registry, resolveComponent = resolveViaInstanceManager} = {}) {
    const record = registry?.resolveTarget?.({instanceId});

    if (!record) {
        return {accepted: false, reason: `no registry record for instanceId "${instanceId}"`, stage: ACCEPT_STAGES.MUTATION, blueprint: null};
    }

    if (record.state !== 'live') {
        return {accepted: false, reason: `instanceId "${instanceId}" is disposed — disposed instances never mutate`, stage: ACCEPT_STAGES.MUTATION, blueprint: null};
    }

    const validation = validateMutation(record.blueprintSnapshot, mutation);

    if (!validation.accepted) {
        return {accepted: false, reason: validation.reason, stage: ACCEPT_STAGES.MUTATION, blueprint: null};
    }

    const component = typeof resolveComponent === 'function' ? resolveComponent(instanceId) : null;

    if (!component) {
        return {accepted: false, reason: `no live component resolvable for "${instanceId}" — registry and stage disagree`, stage: ACCEPT_STAGES.MUTATION, blueprint: null};
    }

    // Apply the merged blueprint through the core's batched path. On the default
    // (instance-manager) resolution the component shape is a core-contract guarantee; this guard is
    // belt-and-suspenders for ANY applier/set failure (a hook throwing, an injected test double):
    // fail closed with a bounded refusal and DO NOT record the mutation — a thrown applier must
    // never leave the registry claiming a change the component never took.
    try {
        SCHEMA_MATERIALIZERS[validation.blueprint.schema].apply(component, validation.blueprint);
    } catch (error) {
        return {accepted: false, reason: `live component for "${instanceId}" could not take the mutation (registry/stage disagree): ${error instanceof Error ? error.message : String(error)}`, stage: ACCEPT_STAGES.MUTATION, blueprint: null};
    }

    registry.markMutated(instanceId, {title: validation.blueprint.title, blueprintSnapshot: validation.blueprint});

    return {accepted: true, reason: null, stage: null, blueprint: validation.blueprint}
}

/**
 * @summary Disposes a created instance: destroys the live component when resolvable, then flips
 * the registry record (kept, state `disposed`). A missing component does not block the registry
 * flip — a half-dead instance must still leave truthful state.
 * @param {Object} options
 * @param {String} options.instanceId
 * @param {Object} options.registry The CreatedInstances singleton
 * @param {Function} [options.resolveComponent] `(instanceId) => live component|null`; defaults to
 *   the core instance manager (`Neo.get`) — override only as a test seam
 * @returns {{accepted: Boolean, reason: String|null, stage: String|null}}
 */
export function disposeInstance({instanceId, registry, resolveComponent = resolveViaInstanceManager} = {}) {
    const flipped = registry?.markDisposed?.(instanceId);

    if (!flipped?.accepted) {
        return {accepted: false, reason: flipped?.reason || 'registry unavailable', stage: ACCEPT_STAGES.DISPOSE};
    }

    const component = typeof resolveComponent === 'function' ? resolveComponent(instanceId) : null;

    component?.destroy?.();

    return {accepted: true, reason: null, stage: null}
}
