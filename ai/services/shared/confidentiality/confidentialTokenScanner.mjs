/**
 * @summary Scans outbound content for confidential tokens before it reaches a public surface, and
 * reports *why* it did or did not scan.
 *
 * Client names must never appear in public artifacts. The harm is transitive and legal rather than
 * competitive: a client's own customers search the client name, reach a public bugfix artifact in this
 * repository, and read our defect as theirs. The damaged party is neither us nor our counterparty,
 * which is what makes it actionable.
 *
 * **Why a scanner and not a checklist.** The rule and a pre-publish grep step were both already
 * written down, and the mechanism still recurred three times across three different agents. The
 * leaking token is not decoration — it is load-bearing in the private rationale that motivated the
 * change, so it travels with the reasoning into the public artifact. Generic framing ("an external
 * deployment") carries identical force, which is exactly why the substitution is safe to automate and
 * easy to forget.
 *
 * **Four outcomes, because three of them are not "pass".** The defect this replaces was a validator
 * returning a bare pass on a body it had never examined. Every non-blocking outcome here therefore
 * states the reason it did not block, and a caller cannot treat "did not block" as "was checked"
 * without discarding a field:
 *
 * | outcome | meaning |
 * |---|---|
 * | `blocked` | a token matched — with token and offset, so the author scrubs before posting |
 * | `clean` | scanned against a configured list, nothing matched |
 * | `unchecked` | no denylist configured — enforcement did not run, and says so |
 * | `skipped` | the target is private, where client specifics legitimately live |
 *
 * `reason` further separates `target-public` from `target-unknown` on the scanning path. Those two
 * behave identically and diagnose oppositely: an operator on a private deployment seeing a block would
 * otherwise read a content problem, when the cause is an unresolved visibility fetch several layers
 * away — they would redact a legitimate name, be blocked again on the next one, and have nothing
 * pointing at the real fault. Behaviour identical, diagnosis opposite, is precisely when two states
 * must stay separate.
 *
 * **The matched token is returned to the author, never emitted onward.** It is the confidential value
 * itself; it belongs in a local tool response so the author can act, and in no log, artifact, or
 * telemetry surface that outlives the call.
 *
 * @module ai/services/shared/confidentiality/confidentialTokenScanner
 */

/**
 * @summary Scan outcomes. Only `clean` means "examined and safe".
 * @type {Object}
 */
export const SCAN_OUTCOME = Object.freeze({
    blocked  : 'blocked',
    clean    : 'clean',
    skipped  : 'skipped',
    unchecked: 'unchecked'
});

/**
 * @summary Why the scanner reached its outcome. Load-bearing for diagnosis, not decoration.
 * @type {Object}
 */
export const SCAN_REASON = Object.freeze({
    listUnconfigured: 'list-unconfigured',
    targetPrivate   : 'target-private',
    targetPublic    : 'target-public',
    targetUnknown   : 'target-unknown'
});

/**
 * @summary Resolved visibility of the write target.
 *
 * `unknown` is a real state, not a placeholder: the boot metadata fetch can fail structurally — a
 * token without repository-metadata scope, a deployment where the query is unauthorized — in which
 * case it never resolves. It must therefore be handled explicitly rather than defaulted away.
 * @type {Object}
 */
export const TARGET_VISIBILITY = Object.freeze({
    private: 'private',
    public : 'public',
    unknown: 'unknown'
});

/**
 * @summary Folds a string to its match key: lowercase, alphanumerics only.
 *
 * Separator-insensitivity is required rather than convenient. One recorded leak carried an engagement
 * through a config-entry prefix with no prose around it, so `AcmeCorp`, `acme-corp`, `acme_corp` and
 * `Acme Corp` must all match one denylist entry. Case folding alone would have missed every one of
 * those but the last.
 * @param {String} value
 * @returns {String}
 * @private
 */
function foldForMatch(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/gu, '')
}

/**
 * @summary Folds text while retaining, for each folded character, its index in the original string.
 *
 * Folding collapses separators, so a match offset in folded space does not address the original text.
 * Reporting a shifted offset would send an author to the wrong place in their own body, which is worse
 * than reporting none — so the map is built once and the offset reported is always the original one.
 * @param {String} text
 * @returns {{folded: String, offsets: Number[]}}
 * @private
 */
function foldWithOffsets(text) {
    const
        folded  = [],
        offsets = [];

    for (let i = 0; i < text.length; i++) {
        const character = text[i].toLowerCase();

        if (/[a-z0-9]/u.test(character)) {
            folded.push(character);
            offsets.push(i)
        }
    }

    return {folded: folded.join(''), offsets}
}

/**
 * @summary Scans one outbound body against the confidential denylist.
 *
 * Pure and total: never throws, never mutates its inputs, and always returns an outcome naming why it
 * reached it. Precedence is deliberate — a private target needs no list, so it is answered before the
 * list is consulted and an unconfigured list on a private deployment is not reported as a gap.
 *
 * @param {String} text The outbound content.
 * @param {Object} [options]
 * @param {String[]} [options.denylist=[]] Confidential tokens. Empty means unconfigured, NOT safe.
 * @param {String} [options.targetVisibility=TARGET_VISIBILITY.unknown] Resolved visibility of the
 *     write target. Anything other than `private` or `public` is treated as `unknown`, so a
 *     malformed value fails toward scanning rather than toward silence.
 * @returns {{outcome: String, reason: String, matches: Array<{token: String, offset: Number}>}}
 */
export function scanForConfidentialTokens(text, {
    denylist         = [],
    targetVisibility = TARGET_VISIBILITY.unknown
} = {}) {
    // A private repository is where client specifics are SANCTIONED, so this is the one path that
    // legitimately does not scan. Answered first: consulting the list here would report an
    // unconfigured denylist as a gap on a deployment that does not need one.
    if (targetVisibility === TARGET_VISIBILITY.private) {
        return {outcome: SCAN_OUTCOME.skipped, reason: SCAN_REASON.targetPrivate, matches: []}
    }

    // Anything that is not explicitly public is unknown. A malformed or absent visibility must fail
    // toward scanning: the two errors are not symmetric, and only one of them is unrecoverable.
    const visibilityReason = targetVisibility === TARGET_VISIBILITY.public
        ? SCAN_REASON.targetPublic
        : SCAN_REASON.targetUnknown;

    const tokens = Array.isArray(denylist)
        ? denylist.filter(token => typeof token === 'string' && foldForMatch(token).length > 0)
        : [];

    // No list means enforcement did not run. Returning `clean` here would reproduce the exact defect
    // this module exists to end: a bare pass on a body nothing examined.
    if (tokens.length === 0) {
        return {outcome: SCAN_OUTCOME.unchecked, reason: SCAN_REASON.listUnconfigured, matches: []}
    }

    if (typeof text !== 'string' || text.length === 0) {
        return {outcome: SCAN_OUTCOME.clean, reason: visibilityReason, matches: []}
    }

    const
        {folded, offsets} = foldWithOffsets(text),
        matches           = [];

    for (const token of tokens) {
        const
            foldedToken = foldForMatch(token);
        let searchFrom = folded.indexOf(foldedToken);

        while (searchFrom !== -1) {
            // The ORIGINAL offset, mapped back through the fold. An author given a folded-space index
            // would be pointed at the wrong character of their own body.
            matches.push({token, offset: offsets[searchFrom]});
            searchFrom = folded.indexOf(foldedToken, searchFrom + 1)
        }
    }

    return matches.length > 0
        ? {outcome: SCAN_OUTCOME.blocked, reason: visibilityReason, matches}
        : {outcome: SCAN_OUTCOME.clean, reason: visibilityReason, matches: []}
}

/**
 * @summary True when the scan result must stop a publish.
 *
 * Exists so callers branch on one named predicate rather than each re-deciding which outcomes are
 * permissive — the re-decision being where a permissive default would creep back in.
 * @param {Object} result From {@link scanForConfidentialTokens}.
 * @returns {Boolean}
 */
export function isPublishBlocked(result) {
    return result?.outcome === SCAN_OUTCOME.blocked
}
