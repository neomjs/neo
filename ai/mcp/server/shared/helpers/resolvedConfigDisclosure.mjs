/**
 * @module resolvedConfigDisclosure
 * @summary The allowlist that decides which resolved config values a service may publish about itself.
 *
 * ## What this exists for
 *
 * A deployment's health is observable from outside the process; the configuration it was given is
 * not. During an incident that asymmetry means diagnosis proceeds against *assumed* inputs — and the
 * assumed value and the real one can differ by the whole factor that matters, because a per-service
 * `.env` overrides the compose default with nothing reporting that it did. The only remaining answer
 * was to ask an operator to read a value back to us that we had chosen for them.
 *
 * ## Why the allowlist lives at the WRITER, not the reader
 *
 * The disclosure decision is enforced in the process that *owns* the values, before anything is
 * written, rather than in the bridge that relays them. That is deliberate and it is the stronger
 * property: an unallowlisted value never leaves the owning process at all, so no downstream relay,
 * log, snapshot copy or future consumer can surface what was never emitted. Filtering at the relay
 * would leave the full set in transit and make every new consumer a place the filter must be
 * re-applied correctly.
 *
 * ## The security invariant, and the four clauses that carry it
 *
 * These tools must never be able to read secrets. That holds here by construction rather than by
 * redaction:
 *
 * 1. **No environment access.** Nothing in this module reads `process.env`. It is a pure function
 *    over an already-resolved config object handed in by its caller, so there is no code path from
 *    disclosure to the environment — nothing for a filter to fail to catch. It also keeps the module
 *    free of any config-singleton import, so it is safe to use from a module that must not pull the
 *    framework in, and a spec can exercise every arm without touching shared state.
 * 2. **Allowlist, never denylist.** A denylist fails open on every key added after it was written.
 *    The failure mode of an allowlist is a *missing value* — visible, harmless, and repaired by a
 *    reviewed addition. The failure mode of a denylist is a leaked one.
 * 3. **No wildcards, no prefix matching.** `embedding.*` would silently admit a future
 *    `embedding.apiKey`. An allowlist whose match region is a superset of its intent holds only until
 *    someone adds a matching name for an unrelated reason, which is exactly how a guard that looked
 *    correct for a year stops being correct in one commit. {@link assertDisclosureAllowlist} refuses
 *    such an entry at module load rather than trusting review to catch it.
 * 4. **Disclosure kinds as a second floor.** Every entry declares the primitive it may reveal. A path
 *    declared `number` cannot carry a token even if a later refactor moves something unexpected
 *    behind that path — the value fails its kind and is omitted with a reason.
 *
 * **The kind is NOT the config leaf's type, and conflating them would define one thing twice.** The
 * leaf already owns the value domain: `leaf(50, 'NEO_KB_EMBEDDING_BATCH_SIZE', 'positiveInt')`
 * validates that the configured value is a positive integer, and re-stating `positiveInt` here would
 * duplicate that authority. `kind` answers a different question — *what class of thing may be
 * disclosed* — and is deliberately coarser. A leaf may tighten its type freely without touching this
 * file; that is the separation working, not drift.
 *
 * ## Why absence must carry a reason
 *
 * An omitted entry is reported with the reason it was omitted, never silently dropped and never
 * defaulted. A reader who cannot tell "this service did not report" from "this service reported the
 * default" will read the second when only the first is true — and a wrong value is worse than a
 * missing one, because a missing value gets checked and an answered one does not. The consuming
 * bridge must not substitute its own resolution for an absent entry: the value belongs to the
 * process that owns it, and a value resolved in a different process is a confident answer about
 * something nobody asked.
 */

/**
 * Primitive classes a disclosure entry may declare.
 *
 * `enum` means a short, non-sensitive identifier drawn from a closed set (a transport name, a mode);
 * it is the only string-bearing kind, and it exists so a genuinely enumerated setting is reportable
 * without opening `string` as a category. There is deliberately no free `string` kind — a free string
 * is the shape a credential has.
 * @member {String[]} DISCLOSURE_KINDS
 * @protected
 */
export const DISCLOSURE_KINDS = Object.freeze(['number', 'boolean', 'enum']);

/**
 * Maximum characters an `enum` value may disclose.
 *
 * A closed-set identifier is short by nature. The bound is a backstop for the case where a path
 * declared `enum` comes to hold something longer than an identifier: a token that somehow satisfied
 * the kind check would still fail the length check, and the entry is omitted rather than published.
 * @member {Number} MAX_ENUM_VALUE_LENGTH
 * @protected
 */
export const MAX_ENUM_VALUE_LENGTH = 64;

/**
 * Validates an allowlist at module load and throws on any entry that would widen its match region.
 *
 * Called by the module that declares an allowlist, so a malformed entry fails at import rather than
 * at the first disclosure. Failing loudly here is the point: a silently-ignored bad entry is
 * indistinguishable from a value the service chose not to report.
 * @param {Array<Object>} allowlist Entries of `{path, kind}`.
 * @returns {Array<Object>} The same entries, frozen.
 * @throws {Error} On a non-literal path, an unknown kind, or a duplicate path.
 */
export function assertDisclosureAllowlist(allowlist) {
    if (!Array.isArray(allowlist)) {
        throw new Error('resolvedConfigDisclosure: allowlist must be an array of {path, kind} entries.')
    }

    const seen = new Set();

    for (const entry of allowlist) {
        const {path, kind} = entry || {};

        if (typeof path !== 'string' || !path) {
            throw new Error(`resolvedConfigDisclosure: entry path must be a non-empty string, received ${JSON.stringify(path)}.`)
        }

        // The clause that keeps the invariant from eroding. A path is a LITERAL dot-path and nothing
        // else: no wildcard, no glob, no regex metacharacter, no empty segment. Rejected at load so
        // `embedding.*` cannot be introduced by someone who reasonably believes it is a convenience.
        if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path)) {
            throw new Error(`resolvedConfigDisclosure: entry path "${path}" is not a literal dot-path. Wildcards and prefix matches are refused: a match region wider than its intent admits keys nobody reviewed.`)
        }

        if (!DISCLOSURE_KINDS.includes(kind)) {
            throw new Error(`resolvedConfigDisclosure: entry "${path}" declares unknown kind "${kind}". Known kinds: ${DISCLOSURE_KINDS.join(', ')}.`)
        }

        if (seen.has(path)) {
            throw new Error(`resolvedConfigDisclosure: duplicate entry for "${path}".`)
        }

        seen.add(path)
    }

    return Object.freeze(allowlist.map(entry => Object.freeze({...entry})))
}

/**
 * Reads one literal dot-path out of a resolved config object.
 *
 * **Presence is decided by the resolved VALUE, never by `in`, and that is a production requirement
 * rather than a style choice.** A resolved config here is a Proxy that exposes its leaves through a
 * `get` trap and implements no `has` trap, so `'batchSize' in config` is `false` while
 * `config.batchSize` resolves correctly. An `in`-based walk therefore reports `path-absent` for every
 * value that actually reads — a reader that works against a plain object and silently discloses
 * nothing against the real thing.
 *
 * The cost is that a path holding `undefined` is indistinguishable from an absent one. That costs
 * nothing here: an `undefined` behind an allowlisted path would fail its declared kind anyway, so both
 * cases end up omitted, and the reason differs only in precision.
 * @param {Object} config
 * @param {String} path
 * @returns {{found: Boolean, value: *}}
 * @protected
 */
function readPath(config, path) {
    let cursor = config;

    for (const segment of path.split('.')) {
        if (cursor === null || typeof cursor !== 'object') {
            return {found: false, value: undefined}
        }

        const value = cursor[segment];

        if (value === undefined) {
            return {found: false, value: undefined}
        }

        cursor = value
    }

    return {found: true, value: cursor}
}

/**
 * Checks a value against its declared disclosure kind.
 * @param {*} value
 * @param {String} kind
 * @returns {String|null} An omission reason, or `null` when the value may be disclosed.
 * @protected
 */
function kindViolation(value, kind) {
    if (kind === 'number') {
        return Number.isFinite(value) ? null : 'kind-mismatch-expected-finite-number'
    }

    if (kind === 'boolean') {
        return typeof value === 'boolean' ? null : 'kind-mismatch-expected-boolean'
    }

    // `enum`: a short closed-set identifier. Length is checked as well as type, so a long string
    // behind an `enum` path is refused rather than published.
    if (typeof value !== 'string') return 'kind-mismatch-expected-enum-string';
    if (!value) return 'kind-mismatch-empty-enum';

    return value.length > MAX_ENUM_VALUE_LENGTH ? 'kind-mismatch-enum-too-long' : null
}

/**
 * @summary Projects the allowlisted subset of a service's own resolved config for publication.
 *
 * The caller passes its ALREADY-RESOLVED config — this function never resolves anything, reads no
 * environment, and imports no config singleton. That is what makes the disclosure boundary auditable
 * in one place: everything published is an allowlisted path of the object handed in, and nothing else
 * is reachable from here.
 *
 * Omissions are returned beside disclosures rather than dropped, because a reader must be able to
 * tell an unreported value from a reported default. See the module doc on why a wrong value is worse
 * than a missing one.
 *
 * @param {Object} options
 * @param {Object} options.config Resolved config owned by the calling process.
 * @param {Array<Object>} options.allowlist Frozen entries from {@link assertDisclosureAllowlist}.
 * @returns {{disclosed: Object, omitted: Array<Object>}} `disclosed` maps path → `{value, kind}`; `omitted` carries `{path, kind, reason}`.
 */
export function projectDisclosedConfig({config, allowlist}) {
    const disclosed = {},
          omitted   = [];

    if (config === null || typeof config !== 'object') {
        return {disclosed, omitted: allowlist.map(({path, kind}) => ({path, kind, reason: 'config-unavailable'}))}
    }

    for (const {path, kind} of allowlist) {
        const {found, value} = readPath(config, path);

        if (!found) {
            omitted.push({path, kind, reason: 'path-absent'});
            continue
        }

        const violation = kindViolation(value, kind);

        if (violation) {
            omitted.push({path, kind, reason: violation});
            continue
        }

        disclosed[path] = {value, kind}
    }

    return {disclosed, omitted}
}
