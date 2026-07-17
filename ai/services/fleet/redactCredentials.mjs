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
 * **The scheme is matched generically, and that is the whole lesson repeated one level down.**
 * The first cut of this module special-cased `bearer` and let every other scheme fall through to
 * the keyed rule — whose value pattern stops at whitespace, so it consumed the *scheme word* and
 * published the credential one space later: `Authorization: Basic dXNlcjpwYXNzd29yZA==` masked to
 * `Authorization=[redacted] dXNlcjpwYXNzd29yZA==`, announcing sanitization while carrying
 * `user:password`. An allow-list of schemes has an expiry date exactly the way the five copies did
 * — it publishes the token for the first scheme nobody taught it. So the scheme is matched as a
 * generic word: `NTLM`, `Negotiate`, `SCRAM-SHA-256` and anything else are covered without being
 * enumerated. Digest's comma-separated parameters are consumed too, or the value survives past the
 * first comma.
 *
 * **The bias is deliberate: over-redact after `authorization`.** An unknown token following an
 * authorization value is indistinguishable from a credential, so it is consumed. Losing a word of
 * trailing context in a diagnostic is cheap; publishing a credential is not. Everywhere else the
 * rules are anchored to an explicit key or token family, so ordinary prose passes through intact.
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
        // An authorization value in full: an optional generic scheme word, the credential, and any
        // Digest-style `, key="value"` parameters. Must run before the keyed rule, which would
        // otherwise stop at the space after the scheme.
        .replace(/\b((?:proxy-)?authorization)\s*[:=]\s*(?:[A-Za-z][A-Za-z0-9-]*\s+)?[^\s,;)]+(?:\s*,\s*[\w-]+\s*=\s*(?:"[^"]*"|[^\s,;)]+))*/gi, '$1=[redacted]')
        // A bare scheme carrying a credential with no `authorization` key in front of it.
        .replace(/\b(?:bearer|basic|digest)\s+[^\s,;)]+/gi, 'authorization=[redacted]')
        // Keyed secrets — the UNION of every copy's key set, including the composer's
        // (`fleetActivityComposer`, see the ledger note below).
        .replace(/\b(api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|authorization|token|secret|password|passwd|pwd|pat|credential|privateKey|signingKey)\s*[:=]\s*[^\s,;)]+/gi, '$1=[redacted]')
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
 * `sample` is a full diagnostic fragment; `secret` names the substring that must not survive. They
 * are separate because a witness that derives the secret from the sample (by splitting on the last
 * delimiter, say) cannot express a family whose credential contains delimiters — `Digest` and
 * `Basic` both do, and both leaked past the first cut of this module for that reason.
 *
 * @type {Object[]}
 */
export const CREDENTIAL_FAMILIES = Object.freeze([
    {name: 'github-pat-fine-grained', sample: 'github_pat_11ABCDE0Y0abcdefghijkl_MNOPqrstuvwx',      secret: 'github_pat_11ABCDE0Y0abcdefghijkl_MNOPqrstuvwx'},
    {name: 'github-classic',          sample: 'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234',                secret: 'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234'},
    {name: 'github-oauth',            sample: 'gho_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234',                secret: 'gho_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234'},
    {name: 'gitlab-pat',              sample: 'glpat-AAAABBBBCCCCDDDD1234',                          secret: 'glpat-AAAABBBBCCCCDDDD1234'},
    {name: 'bearer',                  sample: 'Authorization: Bearer sk-live-AAAABBBBCCCC1234',      secret: 'sk-live-AAAABBBBCCCC1234'},
    {name: 'basic',                   sample: 'Authorization: Basic dXNlcjpwYXNzd29yZA==',           secret: 'dXNlcjpwYXNzd29yZA=='},
    {name: 'digest',                  sample: 'Authorization: Digest username="u", nonce="abc123"',  secret: 'abc123'},
    {name: 'unlisted-scheme',         sample: 'Authorization: NTLM TlRMTVNTUAABtoken99',             secret: 'TlRMTVNTUAABtoken99'},
    {name: 'proxy-authorization',     sample: 'Proxy-Authorization: Bearer sk-live-PPPP1111',        secret: 'sk-live-PPPP1111'},
    {name: 'keyed-secret',            sample: 'credential=sk-live-AAAABBBBCCCC1234',                 secret: 'sk-live-AAAABBBBCCCC1234'},
    {name: 'api-key',                 sample: 'x-api-key: sk-live-abcdef123456',                     secret: 'sk-live-abcdef123456'},
    {name: 'access-token',            sample: 'access_token: at-live-zzz111',                        secret: 'at-live-zzz111'},
    {name: 'refresh-token',           sample: 'refresh-token=rt-live-www333',                        secret: 'rt-live-www333'},
    {name: 'client-secret',           sample: 'client_secret: cs-live-qqq222',                       secret: 'cs-live-qqq222'},
    {name: 'password',                sample: 'password=pw-live-zzz000',                             secret: 'pw-live-zzz000'},
    {name: 'passwd',                  sample: 'passwd=pw-live-aaa111',                               secret: 'pw-live-aaa111'},
    {name: 'pwd',                     sample: 'pwd: pw-live-bbb222',                                 secret: 'pw-live-bbb222'}
])
