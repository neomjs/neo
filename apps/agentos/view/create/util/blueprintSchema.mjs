/**
 * @module AgentOS.view.create.util.blueprintSchema
 * @summary The ONE blueprint validator for the keeper creation flow — emit-side and accept-side
 * share this module (one vocabulary per contract; two call sites, zero re-derivation).
 *
 * Mechanizes the constrained-blueprint safety contract v2: a creation request never produces
 * arbitrary code — it produces a **versioned, schema-registered, allowlist-validated blueprint**
 * (`{schema, title, config, data}`), and anything outside the allowlists fails CLOSED to a bounded
 * `{accepted: false, reason}` the caller renders as an honest refusal. The pattern generalizes the
 * shipped `blueprintEvidence.mjs` projection (allowlist, not denylist: an unexpected or executable
 * field can never slip through) from evidence display to the full create/mutate path.
 *
 * Hard exclusions enforced by construction, everywhere in the payload (deep scan):
 * function values · `html`/`innerHTML`-class keys · event-handler configs (`listeners`,
 * `handler(s)`, `on*`) · unregistered schemas · non-allowlisted config keys. Mutations are partial
 * blueprints under the SAME validator — a follow-up can never introduce a key creation couldn't.
 */

/**
 * @summary Key names that are forbidden ANYWHERE in a blueprint payload (deep scan) — the
 * executable/injection surface. Checked case-insensitively for the html class; `on*` matches the
 * DOM-handler convention (`onClick`, `onchange`, …).
 * @type {RegExp[]}
 */
const FORBIDDEN_KEY_PATTERNS = Object.freeze([
    /^html$/i,
    /^innerhtml$/i,
    /^listeners$/,
    /^handlers?$/,
    /^on[A-Z]/,
    /^on[a-z]/
]);

/**
 * @summary The only top-level keys a blueprint may carry.
 * @type {ReadonlyArray<String>}
 */
export const BLUEPRINT_TOP_LEVEL_KEYS = Object.freeze(['schema', 'title', 'config', 'data']);

/**
 * @summary The registered blueprint schemas — the T5 plugin contract's substrate: adding a widget
 * type is ONE registration here, never a validator fork. `grid@1` is the canonical first type
 * (the birds-eye demo widget).
 *
 * Per schema: `configAllowlist` = the ONLY keys `config` may carry; `validate` = the per-schema
 * structural check run after the generic gates.
 * @type {Object}
 */
export const BLUEPRINT_SCHEMAS = Object.freeze({
    'grid@1': Object.freeze({
        configAllowlist: Object.freeze(['columns', 'height', 'width']),
        /**
         * @param {Object} blueprint
         * @returns {String|null} a rejection reason, or null when structurally valid
         */
        validate(blueprint) {
            const columns = blueprint.config?.columns;

            if (!Array.isArray(columns) || columns.length === 0) {
                return 'grid@1 requires config.columns as a non-empty array';
            }

            for (const column of columns) {
                if (column == null || typeof column !== 'object' || typeof column.field !== 'string' || typeof column.text !== 'string') {
                    return 'grid@1 columns must be objects with string "field" + "text"';
                }
            }

            if (!Array.isArray(blueprint.data)) {
                return 'grid@1 requires data as an array of row objects';
            }

            for (const row of blueprint.data) {
                if (row == null || typeof row !== 'object' || Array.isArray(row)) {
                    return 'grid@1 data rows must be plain objects';
                }
            }

            return null;
        }
    })
});

/**
 * @summary Deep-scans a value for forbidden keys and function values — the executable surface a
 * blueprint may never carry, at any nesting depth.
 * @param {*} value
 * @param {String} path Human-readable location for the rejection reason
 * @returns {String|null} a rejection reason, or null when clean
 */
function findExecutableSurface(value, path) {
    if (typeof value === 'function') {
        return `function value at "${path}" — blueprints are data, never code`;
    }

    if (value == null || typeof value !== 'object') {
        return null;
    }

    const entries = Array.isArray(value)
        ? value.map((item, index) => [String(index), item])
        : Object.entries(value);

    for (const [key, child] of entries) {
        if (!Array.isArray(value) && FORBIDDEN_KEY_PATTERNS.some(pattern => pattern.test(key))) {
            return `forbidden key "${key}" at "${path}" — html/handler-class fields never enter a blueprint`;
        }

        const nested = findExecutableSurface(child, `${path}.${key}`);

        if (nested) {
            return nested;
        }
    }

    return null;
}

/**
 * @summary Validates a full creation blueprint against the v2 contract. Fail-closed, never throws:
 * every caller (emit-side route, accept-side instantiation) branches on `accepted`.
 * @param {Object} blueprint Candidate `{schema, title, config, data}`
 * @returns {{accepted: Boolean, reason: String|null}}
 */
export function validateBlueprint(blueprint) {
    if (blueprint == null || typeof blueprint !== 'object' || Array.isArray(blueprint)) {
        return {accepted: false, reason: 'blueprint must be a plain object'};
    }

    const unknownKeys = Object.keys(blueprint).filter(key => !BLUEPRINT_TOP_LEVEL_KEYS.includes(key));

    if (unknownKeys.length > 0) {
        return {accepted: false, reason: `unexpected top-level keys: ${unknownKeys.join(', ')}`};
    }

    const schemaDef = BLUEPRINT_SCHEMAS[blueprint.schema];

    if (!schemaDef) {
        return {accepted: false, reason: `unregistered blueprint schema "${blueprint.schema}" — registration is a reviewed change, not a write`};
    }

    if (typeof blueprint.title !== 'string' || blueprint.title.trim() === '') {
        return {accepted: false, reason: 'blueprint requires a non-empty string title'};
    }

    if (blueprint.config == null || typeof blueprint.config !== 'object' || Array.isArray(blueprint.config)) {
        return {accepted: false, reason: 'blueprint requires a config object'};
    }

    const configViolations = Object.keys(blueprint.config).filter(key => !schemaDef.configAllowlist.includes(key));

    if (configViolations.length > 0) {
        return {accepted: false, reason: `config keys outside the ${blueprint.schema} allowlist: ${configViolations.join(', ')}`};
    }

    const executable = findExecutableSurface(blueprint, 'blueprint');

    if (executable) {
        return {accepted: false, reason: executable};
    }

    const structural = schemaDef.validate(blueprint);

    if (structural) {
        return {accepted: false, reason: structural};
    }

    return {accepted: true, reason: null};
}

/**
 * @summary Validates a follow-up MUTATION as a partial blueprint under the same contract: only
 * allowlisted config keys and/or data may change; schema and executable-surface rules apply
 * unchanged (a mutation can never introduce what creation couldn't).
 * @param {String} schema The live instance's registered schema id
 * @param {Object} mutation Partial `{title?, config?, data?}`
 * @returns {{accepted: Boolean, reason: String|null}}
 */
export function validateMutation(schema, mutation) {
    const schemaDef = BLUEPRINT_SCHEMAS[schema];

    if (!schemaDef) {
        return {accepted: false, reason: `unregistered blueprint schema "${schema}"`};
    }

    if (mutation == null || typeof mutation !== 'object' || Array.isArray(mutation)) {
        return {accepted: false, reason: 'mutation must be a plain object'};
    }

    const unknownKeys = Object.keys(mutation).filter(key => !['title', 'config', 'data'].includes(key));

    if (unknownKeys.length > 0) {
        return {accepted: false, reason: `mutations may only touch title/config/data — unexpected: ${unknownKeys.join(', ')}`};
    }

    if ('config' in mutation) {
        if (mutation.config == null || typeof mutation.config !== 'object' || Array.isArray(mutation.config)) {
            return {accepted: false, reason: 'mutation config must be a plain object'};
        }

        const violations = Object.keys(mutation.config).filter(key => !schemaDef.configAllowlist.includes(key));

        if (violations.length > 0) {
            return {accepted: false, reason: `mutation config keys outside the ${schema} allowlist: ${violations.join(', ')}`};
        }
    }

    const executable = findExecutableSurface(mutation, 'mutation');

    if (executable) {
        return {accepted: false, reason: executable};
    }

    return {accepted: true, reason: null};
}
