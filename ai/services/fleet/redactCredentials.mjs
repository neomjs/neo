/**
 * @module ai/services/fleet/redactCredentials
 * @summary The single credential-redaction authority for Fleet diagnostics that reach a Body-side
 * projection.
 *
 * **Why this module exists rather than a sixth regex.** Five adapters each grew a private copy of
 * this redactor (`fleetThrottleStateAdapter`, `fleetWakeStateAdapter`, `fleetMailboxMirrorAdapter`,
 * `fleetPrLaneActivityAdapter`, `fleetA2AActivityAdapter`), written by three different maintainers.
 * Each was complete against the token families that existed the day it was written; each was then
 * copied from a sibling, inheriting that sibling's gaps but not the coverage the sibling lacked.
 * The copies drifted, a sixth family (`github_pat_`) arrived after the drift, and it landed in
 * none of them — every one of the five leaked a fine-grained PAT verbatim into an operator-visible
 * row reason. The union of what the five knew was the real contract and no single copy held it.
 * That is the defect: not the missing pattern, the duplication that made a missing pattern
 * survivable. Patching five regexes leaves five things to forget when the seventh family ships.
 *
 * **Order is load-bearing, not stylistic.** `bearer` must be masked before the keyed rule: the keyed
 * pattern stops at whitespace, so `authorization=bearer ghp_…` would match only `authorization=bearer`
 * and leave the token itself exposed one space later. Only `fleetMailboxMirrorAdapter` knew this;
 * it is the reason the union had to be built from all five rather than from the most recent.
 *
 * **Replacement labels are literals, never derived from the match.** A label computed from the
 * matched text turns a delimiter-less secret into its own label — the output then announces it was
 * sanitized while still carrying the credential, and a witness asserting `toContain('[redacted]')`
 * goes green on it.
 *
 * @param {*} text Any diagnostic fragment; non-strings are coerced.
 * @returns {String} the fragment with every known credential family masked.
 */
export function redactCredentials(text) {
    return String(text)
        // Bearer first — see the order note above.
        .replace(/\b(?:authorization\s*[:=]\s*)?bearer\s+[^\s,;)]+/gi, 'authorization=[redacted]')
        .replace(/\b(authorization|token|secret|password|pat|credential|privateKey|signingKey)\s*[:=]\s*[^\s,;)]+/gi, '$1=[redacted]')
        // Fine-grained GitHub PAT. `\bgh[pousr]_` cannot reach it: the character class fails on the
        // `i` of `github`, so this family passed through all five predecessors untouched.
        .replace(/\bgithub_pat_[A-Za-z0-9_]+/g, '[redacted-token]')
        .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, '[redacted-token]')
        .replace(/\bglpat-[A-Za-z0-9_-]+/g, '[redacted-token]')
}

/**
 * @summary Every credential family this module masks, exported so a witness can enumerate the
 * contract instead of restating it.
 *
 * A test that hard-codes its own list drifts from the implementation exactly the way the five
 * adapters drifted from each other — silently, and in the direction of fewer families. Importing
 * the contract means adding a family here fails any witness that has not been taught to prove it.
 *
 * @type {Object[]}
 */
export const CREDENTIAL_FAMILIES = Object.freeze([
    {name: 'github-pat-fine-grained', sample: 'github_pat_11ABCDE0Y0abcdefghijkl_MNOPqrstuvwx'},
    {name: 'github-classic',          sample: 'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234'},
    {name: 'github-oauth',            sample: 'gho_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234'},
    {name: 'gitlab-pat',              sample: 'glpat-AAAABBBBCCCCDDDD1234'},
    {name: 'bearer',                  sample: 'Authorization: Bearer sk-live-AAAABBBBCCCC1234'},
    {name: 'keyed-secret',            sample: 'credential=sk-live-AAAABBBBCCCC1234'}
])
