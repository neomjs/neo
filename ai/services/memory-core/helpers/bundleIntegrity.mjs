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
 */

/**
 * @summary Names the subsystems whose export was classified `empty`.
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {String[]} Subsystem names, empty when none or when the block is absent.
 */
export function emptySubsystems(integrity) {
    return Array.isArray(integrity)
        ? integrity.filter(check => check?.status === 'empty').map(check => check?.subsystem ?? 'unknown')
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
 * ANY empty subsystem disqualifies the whole bundle. A partial restore is not a restore: recovering
 * memories while the knowledge base comes back empty is a silently incomplete system, which is the
 * failure mode that is hardest to notice afterwards.
 *
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {Boolean|null}
 */
export function isBundleRestorable(integrity) {
    if (!Array.isArray(integrity)) {
        return null;
    }

    return emptySubsystems(integrity).length === 0;
}

/**
 * @summary Projects the integrity checks into the compact summary receipts and health blocks embed.
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {{restorable: Boolean|null, emptySubsystems: String[]}}
 */
export function summarizeBundleIntegrity(integrity) {
    return {
        emptySubsystems: emptySubsystems(integrity),
        restorable     : isBundleRestorable(integrity)
    }
}
