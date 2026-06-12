/**
 * The delta-stream wire contract, as a consumable vocabulary plus universal batch predicates.
 *
 * Every DOM change in Neo crosses the VDom→Main boundary as a serialized JSON delta. This module
 * names that wire format's grammar — the action set, per-action field contracts, sentinel
 * encodings, the reserved-target id allowlist, and the three-sorted id space — and provides
 * pure, never-throwing predicates over a delta batch for the invariants which hold universally
 * (independent of which feature operation produced the batch).
 *
 * **Plain-module discipline:** like `src/vdom/domConstants.mjs`, this file exports plain data and
 * functions with no class lifecycle and no `Neo` globals required at import time, so it is equally
 * importable from the Main thread, the VDom worker, and the Node unit-test environment.
 *
 * **Boundary semantics this module encodes (but does not modify):**
 * - The consumer dispatches by `delta.action || 'updateNode'` — an absent `action` IS the wire
 *   spelling of `updateNode`, and it is the dominant spelling: the differ never sets `action`
 *   on attribute/class/style/content updates.
 * - `updateNode` resolves its target via a body-defaulting lookup: an `undefined` id silently
 *   targets `document.body`. The U4 predicate exists to make that misdirection visible — an
 *   updateNode must either carry an explicit id or name a reserved target on purpose.
 * - The producer keeps two queues and concatenates `default` then `remove`, because removed
 *   trees can contain nodes which concurrently move out of them — so within one batch, no
 *   `removeNode` may precede a non-remove delta (U3).
 * - Validators must never throw: an exception escaping mid-batch leaves the DOM partially
 *   applied while the worker's vnode model assumes full application — the precise stale-baseline
 *   hazard a grammar layer exists to prevent. Predicates return findings; callers decide.
 * @module vdom/util/DeltaGrammar
 */

/**
 * The complete set of consumer-dispatched delta actions.
 * @type {Set<String>}
 */
export const ACTIONS = new Set([
    'focusNode',
    'insertNode',
    'moveNode',
    'removeAll',
    'removeNode',
    'replaceChild',
    'updateNode',
    'updateVtext'
]);

/**
 * The action a delta resolves to when its `action` property is absent.
 * The differ emits its attribute/class/style/content updates without an `action` key,
 * so this implicit spelling is the most common form on the wire.
 * @type {String}
 */
export const IMPLICIT_ACTION = 'updateNode';

/**
 * Target ids which resolve to global objects instead of element lookups.
 * An updateNode naming one of these is an intentional global write — anything else
 * must carry an explicit element id (see `checkExplicitTarget`).
 * @type {Set<String>}
 */
export const RESERVED_TARGET_IDS = new Set([
    'body',
    'document',
    'document.body',
    'window'
]);

/**
 * The three sorts of the delta id space. An id's sort is NOT recoverable from the id string —
 * it is determined by how the node was rendered:
 * - `element`: a real DOM element, resolvable via id lookup.
 * - `fragment`: a comment-anchored RANGE (`<!-- id-start -->` … `<!-- id-end -->`) with no
 *   single DOM node; insert/move/remove address it via its parent + anchors.
 * - `vtext`: a text node wrapped in a comment pair carrying the id.
 * Existence checks against the document therefore depend on the sort: a failed element lookup
 * does not imply the id is not live. Classifying an arbitrary id requires live-tree context
 * and is deliberately outside this module's scope.
 * @type {Object}
 */
export const ID_SORTS = Object.freeze({
    element : 'element',
    fragment: 'fragment',
    vtext   : 'vtext'
});

/**
 * Per-action field contracts.
 * - `required`: fields every well-formed delta of this action carries.
 * - `payloadAnyOf`: at least one of these fields must be present. Carrying BOTH is legal —
 *   manual producers do, and the consumer picks by renderer config (the DomApi renderer
 *   consumes `vnode`, the string-based renderer `outerHTML`). When the renderer is pinned,
 *   the active renderer's key must be present.
 * - `optional`: fields with documented conditional meaning. `removeNode.parentId` is REQUIRED
 *   when the id is fragment- or vtext-sorted (the comment-anchor removal paths need the parent)
 *   — a condition which needs live context and is therefore documented here, not enforced by U2.
 * - `targetRule: 'explicit-or-reserved'`: the action resolves an id-less delta against
 *   `document.body`; U4 owns the check.
 * - `addressableSorts`: which id sorts the action's consumer paths can address.
 * @type {Object}
 */
export const FIELD_CONTRACTS = Object.freeze({
    focusNode: Object.freeze({
        addressableSorts: [ID_SORTS.element],
        required        : ['id']
    }),
    insertNode: Object.freeze({
        addressableSorts: [ID_SORTS.element, ID_SORTS.fragment],
        // `id` is emitted by some manual producers and ignored by the consumer —
        // the inserted node's identity lives inside `vnode.id` / the HTML string.
        optional        : ['hasLeadingTextChildren', 'id', 'postMountUpdates'],
        payloadAnyOf    : ['vnode', 'outerHTML'],
        required        : ['index', 'parentId']
    }),
    moveNode: Object.freeze({
        addressableSorts: [ID_SORTS.element, ID_SORTS.fragment],
        required        : ['id', 'index', 'parentId']
    }),
    removeAll: Object.freeze({
        addressableSorts: [ID_SORTS.element],
        required        : ['parentId']
    }),
    removeNode: Object.freeze({
        addressableSorts: [ID_SORTS.element, ID_SORTS.fragment, ID_SORTS.vtext],
        optional        : ['parentId'],
        required        : ['id']
    }),
    replaceChild: Object.freeze({
        addressableSorts: [ID_SORTS.element],
        required        : ['fromId', 'parentId', 'toId']
    }),
    updateNode: Object.freeze({
        addressableSorts: [ID_SORTS.element],
        required        : [],
        targetRule      : 'explicit-or-reserved'
    }),
    updateVtext: Object.freeze({
        addressableSorts: [ID_SORTS.vtext],
        required        : ['id', 'parentId', 'value']
    })
});

/**
 * The actions which mutate tree structure (as opposed to mutating a node in place).
 * Used by the U5 candidate predicate.
 * @type {Set<String>}
 */
export const STRUCTURAL_ACTIONS = new Set([
    'insertNode',
    'moveNode',
    'removeNode',
    'replaceChild'
]);

/**
 * Inside `updateNode.attributes`, these values are in-band deletion sentinels: the consumer
 * removes the attribute instead of writing the value. Exception: the `value` pseudo-attribute
 * of input fields is cleared (set to `''`), never removed. Void attributes (e.g. `checked`)
 * are boolean-coerced from their string form.
 * @type {ReadonlyArray<null|String>}
 */
export const ATTRIBUTE_REMOVAL_SENTINELS = Object.freeze([null, '']);

/**
 * Resolves a delta's effective action, applying the implicit-updateNode wire spelling.
 * @param {Object} delta
 * @returns {String|undefined} The effective action, or `undefined` for a non-object delta
 */
export function resolveAction(delta) {
    if (!delta || typeof delta !== 'object') {
        return undefined
    }

    return delta.action || IMPLICIT_ACTION
}

/**
 * Normalizes the consumer's accepted input shapes (a single delta object or an array)
 * into an array, mirroring the dispatch boundary's own normalization EXACTLY: any
 * non-array input is wrapped, including `null` / `undefined` / primitives — because that
 * is what the runtime does before dereferencing `delta.action` on each entry. A wrapped
 * garbage entry then surfaces as a U1 finding (the runtime equivalent is a throw), instead
 * of vanishing into a false-valid empty batch.
 * @param {Object|Object[]} deltas
 * @returns {Object[]}
 */
export function normalizeBatch(deltas) {
    return Array.isArray(deltas) ? deltas : [deltas]
}

/**
 * U1 — action validity. Every delta's effective action must be a member of the dispatched
 * action set. An unknown action string is not ignored by the consumer: it aborts the batch
 * mid-loop, leaving every prior delta applied — the partial-application hazard.
 * @param {Object|Object[]} deltas
 * @returns {Object[]} findings `{rule: 'U1', deltaIndex, detail}`
 */
export function checkActionValidity(deltas) {
    const findings = [];

    normalizeBatch(deltas).forEach((delta, deltaIndex) => {
        const action = resolveAction(delta);

        if (!delta || typeof delta !== 'object') {
            findings.push({rule: 'U1', deltaIndex, detail: 'delta is not an object'})
        } else if (!ACTIONS.has(action)) {
            findings.push({rule: 'U1', deltaIndex, detail: `unknown action "${delta.action}"`})
        }
    });

    return findings
}

/**
 * U2 — per-action required fields.
 * For `insertNode`, the payload contract is renderer-dependent: pass
 * `opts.useDomApiRenderer` to pin the expected payload key (`vnode` for `true`,
 * `outerHTML` for `false`); without the flag, at least one of the two must be
 * present (carrying both is legal — the consumer disambiguates by config).
 * @param {Object|Object[]} deltas
 * @param {Object} [opts]
 * @param {Boolean} [opts.useDomApiRenderer] Pins the insertNode payload key when given
 * @returns {Object[]} findings `{rule: 'U2', deltaIndex, detail}`
 */
export function checkRequiredFields(deltas, opts = {}) {
    const findings = [];

    normalizeBatch(deltas).forEach((delta, deltaIndex) => {
        const action = resolveAction(delta);

        if (!delta || typeof delta !== 'object' || !ACTIONS.has(action)) {
            return // U1 territory; do not double-report
        }

        const contract = FIELD_CONTRACTS[action];

        contract.required.forEach(field => {
            if (delta[field] === undefined || delta[field] === null) {
                findings.push({rule: 'U2', deltaIndex, detail: `${action} is missing required field "${field}"`})
            }
        });

        if (contract.payloadAnyOf) {
            const present = contract.payloadAnyOf.filter(field => delta[field] !== undefined && delta[field] !== null);

            // Carrying BOTH payload keys is legal (manual producers do; the consumer picks by
            // renderer config) — the defect classes are "none at all" and "missing the key the
            // pinned renderer will actually consume".
            if (opts.useDomApiRenderer === true && !present.includes('vnode')) {
                findings.push({rule: 'U2', deltaIndex, detail: `${action} requires "vnode" under the DomApi renderer`})
            } else if (opts.useDomApiRenderer === false && !present.includes('outerHTML')) {
                findings.push({rule: 'U2', deltaIndex, detail: `${action} requires "outerHTML" under the string-based renderer`})
            } else if (opts.useDomApiRenderer === undefined && present.length === 0) {
                findings.push({
                    rule      : 'U2',
                    deltaIndex,
                    detail    : `${action} requires at least one of ${contract.payloadAnyOf.join(', ')}`
                })
            }
        }
    });

    return findings
}

/**
 * U3 — remove-last ordering. The producer emits its `default` queue (inserts, moves, updates)
 * followed by its `remove` queue, because a removed tree can contain nodes which concurrently
 * move out of it. Within one batch, a `removeNode` must therefore never precede a
 * non-`removeNode` delta. (`removeAll` is a children-clearing write belonging to the default
 * queue, not part of the remove tail.)
 * @param {Object|Object[]} deltas
 * @returns {Object[]} findings `{rule: 'U3', deltaIndex, detail}`
 */
export function checkRemoveLastOrdering(deltas) {
    const findings = [];

    let removeTailStartedAt = null;

    normalizeBatch(deltas).forEach((delta, deltaIndex) => {
        const action = resolveAction(delta);

        if (action === 'removeNode') {
            removeTailStartedAt ??= deltaIndex
        } else if (removeTailStartedAt !== null && ACTIONS.has(action)) {
            findings.push({
                rule      : 'U3',
                deltaIndex,
                detail    : `${action} follows the removeNode tail which started at index ${removeTailStartedAt}`
            })
        }
    });

    return findings
}

/**
 * U4 — explicit-target updateNode. The consumer resolves an updateNode's target through a
 * body-defaulting lookup: an `undefined` id silently writes to `document.body`. A well-formed
 * updateNode therefore either carries an explicit non-empty string id, or names a reserved
 * global target on purpose.
 * @param {Object|Object[]} deltas
 * @returns {Object[]} findings `{rule: 'U4', deltaIndex, detail}`
 */
export function checkExplicitTarget(deltas) {
    const findings = [];

    normalizeBatch(deltas).forEach((delta, deltaIndex) => {
        if (resolveAction(delta) !== 'updateNode' || !delta || typeof delta !== 'object') {
            return
        }

        const {id} = delta;

        if (typeof id !== 'string' || id === '') {
            findings.push({
                rule      : 'U4',
                deltaIndex,
                detail    : 'updateNode without an explicit id silently targets document.body'
            })
        }
    });

    return findings
}

/**
 * U5 (CANDIDATE) — within-batch structural uniqueness: at most one structural delta
 * (insertNode, moveNode, removeNode, replaceChild) per node id per batch. The differ
 * accumulates all of a node's in-place changes into a single updateNode, and the pooled
 * rendering architecture never double-touches an id within one batch — but manually
 * constructed multi-producer batches are unproven territory, so this predicate is exported
 * for measurement and is NOT part of `validateBatch`'s default rule set. Promotion to
 * guard-grade requires a falsification run over real-world batches first.
 * For insertNode (which carries no top-level id), the identity is taken from `vnode.id`
 * when present; string-rendered inserts without a vnode are skipped.
 * @param {Object|Object[]} deltas
 * @returns {Object[]} findings `{rule: 'U5', deltaIndex, detail}`
 */
export function checkStructuralUniqueness(deltas) {
    const findings = [],
          seen     = new Map();

    normalizeBatch(deltas).forEach((delta, deltaIndex) => {
        const action = resolveAction(delta);

        if (!STRUCTURAL_ACTIONS.has(action)) {
            return
        }

        const id = delta?.id ?? delta?.vnode?.id;

        if (typeof id !== 'string' || id === '') {
            return
        }

        if (seen.has(id)) {
            findings.push({
                rule      : 'U5',
                deltaIndex,
                detail    : `structural ${action} for id "${id}" already touched structurally at index ${seen.get(id)}`
            })
        } else {
            seen.set(id, deltaIndex)
        }
    });

    return findings
}

checkStructuralUniqueness.candidate = true;

/**
 * Runs the guard-grade universal predicates (U1–U4) over a batch and aggregates their findings.
 * U5 is a measurement candidate and deliberately excluded — run `checkStructuralUniqueness`
 * directly when collecting evidence for its promotion.
 *
 * Never throws; designed to run BEFORE the first delta applies, so a caller can reject a
 * grammatically illegal batch atomically instead of discovering the violation mid-application.
 * @param {Object|Object[]} deltas A delta batch (array) or a single delta object
 * @param {Object} [opts]
 * @param {Boolean} [opts.useDomApiRenderer] Pins the insertNode payload contract when given
 * @returns {Object} `{valid: Boolean, findings: Object[]}`
 */
export function validateBatch(deltas, opts = {}) {
    const findings = [
        ...checkActionValidity(deltas),
        ...checkRequiredFields(deltas, opts),
        ...checkRemoveLastOrdering(deltas),
        ...checkExplicitTarget(deltas)
    ];

    return {valid: findings.length === 0, findings}
}
