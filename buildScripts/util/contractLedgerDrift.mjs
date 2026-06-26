/**
 * @module buildScripts/util/contractLedgerDrift
 * @summary Feasibility spike for an author-side Contract-Ledger-vs-diff drift pre-flight.
 *
 * Proves the mechanically-checkable core: given a Contract Ledger row's stated function surface
 * (e.g. `buildDimensionConsistencyDiagnosis(samples, observedAt, serviceId)`) and the function's
 * shipped declaration (e.g. `export function buildDimensionConsistencyDiagnosis({samples, observedAt,
 * serviceId})`), detect when the two have drifted in a way a reviewer would otherwise catch by hand.
 *
 * Scope (deliberately mechanical, NOT semantic): function NAME, parameter-PASSING STYLE
 * (positional list vs single destructured object), and the top-level parameter-NAME SET. A return-shape
 * or behavioural drift is out of scope — that stays a human/reviewer judgement. This is a spike to inform
 * the routing decision (implement-here vs ideation), not a finished gate; the integration point
 * (agent-preflight step vs pull-request workflow) is the open design question.
 *
 * Motivating real-world drift: a pure producer shipped with a destructured config-object parameter while
 * its Contract Ledger first stated it positional — exactly the param-passing-style drift this flags.
 */

/**
 * @summary Extracts the function name + top-level parameter descriptor from a signature string.
 * @param {String} signature e.g. `fn({a, b})` or `fn(a, b)` or `export function fn({a, b = 1})`.
 * @returns {{name: String, style: 'destructured'|'positional'|'none', params: String[]}|null} null when no `name(...)` is found.
 */
export function parseSignature(signature) {
    const text  = String(signature ?? '').trim(),
          match = text.match(/([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)/);

    if (!match) {
        return null
    }

    const name = match[1],
          raw  = match[2].trim();

    if (raw === '') {
        return {name, style: 'none', params: []}
    }

    // Single destructured-object parameter: `({a, b, c})` (the Neo config-object convention).
    const destructured = raw.match(/^\{([\s\S]*)\}\s*(?:=\s*\{\s*\})?$/);

    if (destructured) {
        return {name, style: 'destructured', params: extractParamNames(destructured[1])}
    }

    return {name, style: 'positional', params: extractParamNames(raw)}
}

/**
 * @summary Splits a parameter list on top-level commas and reduces each to its bare name (drops defaults / types).
 * @param {String} body The inside of the paren or brace group.
 * @returns {String[]}
 */
function extractParamNames(body) {
    return String(body)
        .split(',')
        .map(part => part.split(/[=:]/)[0].replace(/[.\s]/g, ''))
        .filter(Boolean)
        .sort()
}

/**
 * @summary Detects mechanical drift between a Contract Ledger signature and the shipped declaration.
 *
 * @param {Object} options
 * @param {String} options.ledgerSignature The `Target Surface` signature asserted in the ticket's Contract Ledger.
 * @param {String} options.shippedSignature The function's declaration as it appears in the diff.
 * @returns {{drift: Boolean, kinds: String[], detail: Object}} `kinds` ⊆ {`unparseable`, `name`, `param-style`, `param-set`}.
 */
export function detectSignatureDrift({ledgerSignature, shippedSignature} = {}) {
    const ledger  = parseSignature(ledgerSignature),
          shipped = parseSignature(shippedSignature),
          kinds   = [];

    if (!ledger || !shipped) {
        return {drift: true, kinds: ['unparseable'], detail: {ledger, shipped}}
    }

    if (ledger.name !== shipped.name) {
        kinds.push('name')
    }

    if (ledger.style !== shipped.style) {
        kinds.push('param-style')
    }

    if (ledger.params.join(',') !== shipped.params.join(',')) {
        kinds.push('param-set')
    }

    return {drift: kinds.length > 0, kinds, detail: {ledger, shipped}}
}
