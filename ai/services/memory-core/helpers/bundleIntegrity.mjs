/**
 * @module ai/services/memory-core/helpers/bundleIntegrity
 * @summary THE single rule for "is this backup bundle a usable recovery source?".
 *
 * `backup.mjs` classifies each subsystem's export and persists the verdicts into
 * `bundle-meta.integrity`, deliberately non-fatally — a fresh environment legitimately backs up
 * empty, and making that fatal would break first boot for every new deployment. It records the
 * verdict expressly so a downstream consumer can act on it.
 *
 * There are two such consumers — the backup receipt and the health surface — and they must never
 * disagree about what "restorable" means. Two copies of one rule is how the halves of a contract
 * end up one edit apart from contradicting each other, so the rule lives here and is imported,
 * never restated.
 *
 * **Absent is not empty.** A bundle carrying no integrity block predates the block; retained series
 * contain them. Treating missing evidence as a failing verdict would retroactively condemn every
 * historical recovery source — a worse outage than the defect this exists to fix. Absence resolves
 * to `null` (unknown), which is a third answer and not a quiet `false`.
 *
 * **This module answers SURVIVABILITY, and deliberately no longer uses the word `empty` for it.** The
 * question here is "does this bundle carry rows a restore could bring back", and the answer is `no`
 * for a zero-row subsystem regardless of WHY it is zero — a genuinely empty store and a gutted one are
 * equally unrecoverable. Provenance — whether there was anything to capture in the first place — is a
 * different proposition owned by {@link module:ai/services/shared/captureReceipt}, which reserves
 * `empty` for the claim that the facts actually support. The two blocks previously both said `empty`
 * about the same zero and could disagree, so this one says `zero-rows` and the disagreement has no
 * vocabulary left to happen in.
 */

/**
 * The `bundle-meta.integrity` statuses that mean "no rows survived into the bundle".
 *
 * `empty` is retained as an accepted INPUT and never written again. Bundles published before the
 * rename carry it, they are still live recovery sources, and a reader that matched only the new value
 * would silently promote every one of them from `restorable: false` to `restorable: true` — turning a
 * vocabulary correction into the exact false-green this module exists to end.
 * @type {String[]}
 */
const ZERO_ROW_STATUSES = Object.freeze(['zero-rows', 'empty']);

/**
 * @summary Names the subsystems whose export brought back no rows.
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {String[]} Subsystem names, empty when none or when the block is absent.
 */
export function zeroRowSubsystems(integrity) {
    return Array.isArray(integrity)
        ? integrity.filter(check => ZERO_ROW_STATUSES.includes(check?.status)).map(check => check?.subsystem ?? 'unknown')
        : [];
}

/**
 * @summary Resolves whether a bundle is a usable recovery source.
 *
 * Tri-state on purpose: `true` verified restorable, `false` verified NOT restorable, `null` no
 * verdict recorded. A boolean would force absent evidence into one of the decided answers, and
 * either choice is a lie — `false` condemns historical bundles, `true` re-creates the false-green
 * this module exists to end.
 *
 * ANY zero-row subsystem disqualifies the whole bundle. A partial restore is not a restore: recovering
 * memories while the knowledge base comes back with nothing is a silently incomplete system, which is
 * the failure mode that is hardest to notice afterwards.
 *
 * **Lineage does not soften this.** A zero-row source whose collection identity CHANGED is not
 * `empty` in the capture receipt's sense — the facts do not support that claim — and it is still
 * unrestorable here, because the bundle holds no rows either way. Reading the provenance verdict into
 * this one would promote the most suspicious bundle in the series, a zero-row capture over a replaced
 * source, into a usable recovery source.
 *
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {Boolean|null}
 */
export function isBundleRestorable(integrity) {
    if (!Array.isArray(integrity)) {
        return null;
    }

    return zeroRowSubsystems(integrity).length === 0;
}

/**
 * @summary Projects the integrity checks into the compact summary receipts and health blocks embed.
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {{restorable: Boolean|null, zeroRowSubsystems: String[]}}
 */
export function summarizeBundleIntegrity(integrity) {
    return {
        zeroRowSubsystems: zeroRowSubsystems(integrity),
        restorable       : isBundleRestorable(integrity)
    }
}
