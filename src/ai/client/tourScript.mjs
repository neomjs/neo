/**
 * @summary The `neo.tour.script.v1` schema: JSON-first tour scripts + the fail-closed validator
 * and expectation evaluator consumed by {@link Neo.ai.client.TourRunner}.
 *
 * A tour script is the single source for three consumers (the "trinity" contract): the demo
 * a viewer watches, the e2e scenario a replay spec executes, and the video take a recording
 * captures. To stay recordable, diffable and reviewable, a script is **data only** — no
 * functions, no live references, nothing that `JSON.stringify` would lose or mangle. The
 * validator enforces that property structurally (fail-closed), so a script that validates is
 * guaranteed replayable byte-identically.
 *
 * Script shape:
 * ```
 * {
 *     schema: 'neo.tour.script.v1',
 *     id    : 'demo-a',                  // optional stable identifier
 *     title : 'Dock choreography',       // required
 *     scenes: [{
 *         id     : 's1',                 // optional stable identifier
 *         title  : 'Split choreography', // required
 *         caption: '…',                  // optional viewer-facing scene lede
 *         steps  : [
 *             // one semantic dock operation, executed through the app-side NL seam
 *             // (Neo.ai.client.DockService#executeDockOperation); the returned post-op
 *             // document is the settledness signal — steps NEVER settle on wall-clock time
 *             {type: 'op', descriptor: {operation: 'split', …}, caption: '…', expect: […]},
 *
 *             // read the live topology and assert against it (document-level truth)
 *             {type: 'topology-assert', expect: [{path: 'nodes.root.sizes.0', equals: 0.65}]},
 *
 *             // viewer pacing ONLY — pace, never correctness. Spec mode skips the wait
 *             // entirely; the log entry stays, so operation logs are mode-identical.
 *             {type: 'pause', ms: 1200, caption: '…'}
 *         ]
 *     }]
 * }
 * ```
 *
 * Expectation predicates are JSON data as well: `{path, equals}` pairs, where `path` is a
 * dot-path into the dockZone.v1 document (numeric segments index arrays) and `equals` is
 * compared structurally. This deliberately stays below a full query language — the dockZone
 * documents are plain JSON by contract (`learn/agentos/HarnessDockZoneModel.md`), so
 * path-equality covers node existence, split sizes, tab membership and auto-hide flags
 * without inventing an assertion DSL.
 *
 * This module is deliberately dependency-free (a pure data-plane module, the
 * `dockPreviewContract.mjs` pattern): it must be importable by unit specs, the runner and
 * tooling without touching the Neo namespace.
 *
 * Consumers: the dock showcase tour modes, the whitebox-e2e replay specs, and the reviewed
 * demo script content they all share.
 */

/**
 * The tour-script schema identifier. Scripts declaring any other value are rejected
 * fail-closed — schema evolution happens by version bump, never by silent tolerance.
 * @type {String}
 */
export const TOUR_SCRIPT_SCHEMA = 'neo.tour.script.v1';

/**
 * The executable step-type vocabulary of v1. Unknown step types are rejected with this
 * vocabulary enumerated (fail-closed contract, mirroring the dock-operation executor).
 * @type {ReadonlyArray<String>}
 */
export const STEP_TYPES = Object.freeze(['op', 'pause', 'topology-assert']);

/**
 * Step types the schema RESERVES for the perspective / cross-window tool tiers that have not
 * shipped as runner-executable steps yet. Reserved types validate as known —
 * the error message says "reserved, not yet available" instead of "unknown" — but still
 * fail closed: a v1 runner must never silently skip a step it cannot execute.
 * @type {ReadonlyArray<String>}
 */
export const RESERVED_STEP_TYPES = Object.freeze(['cross-window', 'perspective']);

/**
 * Default tolerance for number-to-number comparisons: IEEE floating-point noise scale, not a
 * semantic size tolerance. Dock reducers normalize split sizes to sum 1 (`1 - 0.7` yields
 * `0.30000000000000004`), so exact float equality is brittle by construction — the same
 * reality the dock topology differ acknowledges with its `sizeEpsilon` option. `0.3` vs the
 * normalized `0.30000000000000004` passes; `0.3` vs `0.31` still fails. Predicates needing a
 * coarser tolerance declare their own `epsilon` explicitly.
 * @type {Number}
 */
export const NUMBER_EPSILON = 1e-9;

/**
 * Structural (JSON-value) equality: plain objects, arrays and primitives, with NaN treated
 * as equal to itself and numbers compared within `epsilon` (IEEE-noise absorption — see
 * {@link NUMBER_EPSILON}). Anything a tour script may legally contain compares correctly;
 * anything else was already rejected by the JSON-purity scan.
 * @param {*} a
 * @param {*} b
 * @param {Number} [epsilon=NUMBER_EPSILON] Number-comparison tolerance, threaded through recursion
 * @returns {Boolean}
 */
export function deepEqual(a, b, epsilon = NUMBER_EPSILON) {
    if (a === b) {
        return true
    }

    if (typeof a === 'number' && typeof b === 'number') {
        return (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= epsilon
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => deepEqual(item, b[index], epsilon))
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        const aKeys = Object.keys(a), bKeys = Object.keys(b);

        return aKeys.length === bKeys.length && aKeys.every(key => deepEqual(a[key], b[key], epsilon))
    }

    return false
}

/**
 * Evaluates normalized `{path, equals}` expectations against a dockZone.v1 document.
 * Missing paths resolve to `undefined` and therefore fail their comparison — an absent node
 * is a truthful mismatch, never a skipped assertion.
 * @param {Object|Object[]} expect One predicate or a list of predicates
 * @param {Object|null}     document The dock document to assert against
 * @returns {Object} `{passed, failures}` — each failure carries `{path, expected, actual}`
 */
export function evaluateExpectations(expect, document) {
    const
        predicates = normalizeExpect(expect),
        failures   = [];

    predicates.forEach(({path, equals, epsilon}) => {
        const actual = resolvePath(document, path);

        if (!deepEqual(actual, equals, epsilon ?? NUMBER_EPSILON)) {
            failures.push({actual, expected: equals, path})
        }
    });

    return {failures, passed: failures.length === 0}
}

/**
 * @param {*} value
 * @returns {Boolean} true for `{}`-shaped objects only (null-prototype included)
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
        return false
    }

    const proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null
}

/**
 * Normalizes the `expect` field: a single predicate object becomes a one-element list.
 * @param {Object|Object[]} expect
 * @returns {Object[]}
 */
export function normalizeExpect(expect) {
    return Array.isArray(expect) ? expect : (expect ? [expect] : [])
}

/**
 * Resolves a dot-path into a JSON document. Numeric segments index arrays; any miss along
 * the way returns `undefined` (which comparisons then report as a mismatch).
 * @param {Object|null} document
 * @param {String}      path e.g. `'nodes.root.sizes.0'`
 * @returns {*}
 */
export function resolvePath(document, path) {
    return String(path).split('.').reduce(
        (node, segment) => (node === null || node === undefined) ? undefined : node[segment],
        document
    )
}

/**
 * Recursive JSON-purity scan: rejects functions, symbols, bigints, non-plain object types
 * (Date, Map, class instances, …), `undefined` values, non-finite numbers (`NaN` /
 * `±Infinity` do not survive a JSON round-trip), sparse arrays (holes silently become
 * `null` on the wire), and cyclic references (a cycle can never serialize). This is what
 * makes "JSON-first" a checked property instead of a convention: a script that passes is
 * guaranteed to round-trip `JSON.stringify` → `JSON.parse` byte-faithfully.
 * @param {*}        value
 * @param {String}   path   Human-readable location for the error message
 * @param {String[]} errors Collector, mutated in place
 * @param {WeakSet}  seen   Ancestor objects on the current recursion path (cycle guard)
 */
function scanJsonPurity(value, path, errors, seen = new WeakSet()) {
    const type = typeof value;

    if (value === undefined) {
        errors.push(`${path}: undefined is not valid JSON data — omit the key or use null`);
        return
    }

    if (type === 'function' || type === 'symbol' || type === 'bigint') {
        errors.push(`${path}: ${type} values violate the JSON-first contract (no functions, no live references)`);
        return
    }

    if (type === 'number' && !Number.isFinite(value)) {
        errors.push(`${path}: non-finite number (${value}) does not survive a JSON round-trip`);
        return
    }

    if (type !== 'object' || value === null) {
        return
    }

    if (seen.has(value)) {
        errors.push(`${path}: cyclic reference — a cycle can never serialize`);
        return
    }

    seen.add(value);

    if (Array.isArray(value)) {
        if (value.length !== Object.keys(value).length) {
            errors.push(`${path}: sparse array — holes become null on the wire; use explicit values`)
        } else {
            value.forEach((item, index) => scanJsonPurity(item, `${path}[${index}]`, errors, seen))
        }
    } else if (!isPlainObject(value)) {
        errors.push(`${path}: non-plain object (${value.constructor?.name || 'unknown type'}) violates the JSON-first contract`)
    } else {
        Object.entries(value).forEach(([key, item]) => scanJsonPurity(item, `${path}.${key}`, errors, seen))
    }

    seen.delete(value)
}

/**
 * Validates one expectation list structurally.
 * @param {*}        expect
 * @param {String}   path
 * @param {String[]} errors
 * @param {Boolean}  [required=false] topology-assert steps must carry at least one predicate
 */
function validateExpect(expect, path, errors, required = false) {
    const predicates = normalizeExpect(expect);

    if (required && predicates.length < 1) {
        errors.push(`${path}: requires at least one {path, equals} predicate`);
        return
    }

    predicates.forEach((predicate, index) => {
        const predicatePath = `${path}.expect[${index}]`;

        if (!isPlainObject(predicate)) {
            errors.push(`${predicatePath}: predicates are {path, equals} objects`);
            return
        }

        if (typeof predicate.path !== 'string' || predicate.path.length < 1) {
            errors.push(`${predicatePath}.path: required non-empty string (dot-path into the dock document)`)
        }

        if (!Object.hasOwn(predicate, 'equals')) {
            errors.push(`${predicatePath}.equals: required (the expected JSON value; null is allowed)`)
        }

        if (Object.hasOwn(predicate, 'epsilon') &&
            (typeof predicate.epsilon !== 'number' || !Number.isFinite(predicate.epsilon) || predicate.epsilon < 0)
        ) {
            errors.push(`${predicatePath}.epsilon: must be a finite number >= 0 when present (number-comparison tolerance)`)
        }
    })
}

/**
 * Fail-closed structural validation of a tour script against the v1 schema and a concrete
 * operation vocabulary (pass `DockService.operations` — the executor's exported SSOT — or a
 * fixture vocabulary in unit specs). A `{valid: true}` script is guaranteed: JSON-pure,
 * schema-tagged, non-empty, every step type known and executable, every op inside the
 * supplied vocabulary, every expectation structurally sound.
 * @param {Object} script
 * @param {Object} options
 * @param {String[]} options.operations The executable dock-operation vocabulary (required for op steps)
 * @returns {Object} `{valid, errors}` — errors are human-readable strings with script paths
 */
export function validateTourScript(script, {operations = []} = {}) {
    const errors = [];

    if (!isPlainObject(script)) {
        return {errors: ['script: expected a plain object'], valid: false}
    }

    scanJsonPurity(script, 'script', errors);

    if (errors.length > 0) {
        // structural JSON violations make every deeper check unreliable — report and stop
        return {errors, valid: false}
    }

    if (script.schema !== TOUR_SCRIPT_SCHEMA) {
        errors.push(`script.schema: expected '${TOUR_SCRIPT_SCHEMA}', got '${script.schema}'`)
    }

    if (typeof script.title !== 'string' || script.title.length < 1) {
        errors.push('script.title: required non-empty string')
    }

    if (!Array.isArray(script.scenes) || script.scenes.length < 1) {
        errors.push('script.scenes: required non-empty array');
        return {errors, valid: false}
    }

    script.scenes.forEach((scene, sceneIndex) => {
        const scenePath = `script.scenes[${sceneIndex}]`;

        if (!isPlainObject(scene)) {
            errors.push(`${scenePath}: expected a scene object`);
            return
        }

        if (typeof scene.title !== 'string' || scene.title.length < 1) {
            errors.push(`${scenePath}.title: required non-empty string`)
        }

        if (!Array.isArray(scene.steps) || scene.steps.length < 1) {
            errors.push(`${scenePath}.steps: required non-empty array`);
            return
        }

        scene.steps.forEach((step, stepIndex) => {
            const stepPath = `${scenePath}.steps[${stepIndex}]`;

            if (!isPlainObject(step)) {
                errors.push(`${stepPath}: expected a step object`);
                return
            }

            if (RESERVED_STEP_TYPES.includes(step.type)) {
                errors.push(
                    `${stepPath}.type: '${step.type}' is reserved for the perspective / cross-window ` +
                    'tool tier and not yet available — v1 fails closed instead of skipping it'
                );
                return
            }

            if (!STEP_TYPES.includes(step.type)) {
                errors.push(`${stepPath}.type: unknown '${step.type}'. The v1 vocabulary is: ${STEP_TYPES.join(', ')}`);
                return
            }

            if (step.caption !== undefined && typeof step.caption !== 'string') {
                errors.push(`${stepPath}.caption: must be a string when present`)
            }

            if (step.type === 'op') {
                if (!isPlainObject(step.descriptor)) {
                    errors.push(`${stepPath}.descriptor: required object ({operation, …} — the DockZoneModel.applyOperation() shape)`)
                } else if (operations.length < 1) {
                    errors.push(`${stepPath}.descriptor.operation: no operation vocabulary supplied to the validator — op steps cannot validate fail-closed`)
                } else if (!operations.includes(step.descriptor.operation)) {
                    errors.push(
                        `${stepPath}.descriptor.operation: unknown '${step.descriptor.operation}'. ` +
                        `The executable vocabulary is: ${operations.join(', ')}`
                    )
                }

                validateExpect(step.expect, stepPath, errors)
            }

            if (step.type === 'pause') {
                if (typeof step.ms !== 'number' || !Number.isFinite(step.ms) || step.ms < 0) {
                    errors.push(`${stepPath}.ms: required finite number >= 0 (viewer pacing in milliseconds)`)
                }
            }

            if (step.type === 'topology-assert') {
                validateExpect(step.expect, stepPath, errors, true)
            }
        })
    });

    return {errors, valid: errors.length === 0}
}
