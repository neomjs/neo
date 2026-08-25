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
 * **This module answers SURVIVABILITY.** The question here is "does this bundle carry rows a restore
 * could bring back", and the answer is `no` for a zero-row subsystem regardless of WHY it is zero — a
 * genuinely empty store and a gutted one are equally unrecoverable. Provenance — whether there was
 * anything to capture in the first place — is a different proposition owned by
 * {@link module:ai/services/shared/captureReceipt}, which names its claim `provenEmpty` precisely so
 * that one artifact never publishes two meanings of the bare word `empty`.
 *
 * **`status: 'empty'` is a WIRE VALUE and is deliberately never renamed.** An earlier revision
 * renamed it to `zero-rows` for lexical clarity and introduced a false green:
 * a reader deployed before the rename classifies only `'empty'`, so a bundle written *after* it reads
 * as having no zero-row subsystems at all, i.e. `restorable: true` for a bundle holding nothing.
 * Measured across the four-cell matrix — old/old, new/old, new/new all `false`; **old-reader +
 * new-bundle `true`**. Compatibility here is one-directional by construction: a new reader can be
 * taught old tokens, but readers already deployed can never be taught new ones, and this substrate
 * has planes running four figures of commits behind. The lexical fix therefore belongs on the field
 * nothing has persisted yet, never on this one.
 */

/**
 * @summary The complete recovery-substrate census carried by `bundle-meta.integrity`.
 *
 * Shared with the backup producer so the writer and every survivability reader cannot drift onto
 * different populations. Optional copied artifacts are deliberately absent; only the three
 * row-count-verified recovery substrates belong to this contract.
 * @type {String[]}
 */
export const RECOVERY_SUBSTRATES = Object.freeze(['kb', 'mc', 'graph']);

/**
 * @summary Names the subsystems whose export brought back no rows.
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
 * Completeness includes the census itself. Missing, duplicate, unknown, or non-`pass` rows return
 * `null`; a list whose known members all pass but which omits a recovery substrate is not proof that
 * the omitted substrate passed. A known `empty` remains the stronger negative and returns `false`.
 *
 * ANY empty subsystem disqualifies the whole bundle. A partial restore is not a restore: recovering
 * memories while the knowledge base comes back with nothing is a silently incomplete system, which is
 * the failure mode that is hardest to notice afterwards.
 *
 * **Lineage does not soften this.** A zero-row source whose collection identity CHANGED is not
 * `provenEmpty` in the capture receipt's sense — the facts do not support that claim — and it is
 * still unrestorable here, because the bundle holds no rows either way. Reading the provenance
 * verdict into this one would promote the most suspicious bundle in the series, a zero-row capture
 * over a replaced source, into a usable recovery source.
 *
 * @param {Array<Object>|undefined|null} integrity `bundle-meta.integrity` checks.
 * @returns {Boolean|null}
 */
export function isBundleRestorable(integrity) {
    if (!Array.isArray(integrity)) {
        return null;
    }

    // One established empty is already a complete negative verdict, even when another row is
    // unreadable. Nothing can make a bundle containing no KB (for example) a complete recovery
    // source, so the known negative outranks the unknown sibling.
    if (emptySubsystems(integrity).length > 0) {
        return false
    }

    const seen = new Set();

    for (const entry of integrity) {
        if (!RECOVERY_SUBSTRATES.includes(entry?.subsystem) || seen.has(entry.subsystem) || entry.status !== 'pass') {
            return null
        }

        seen.add(entry.subsystem)
    }

    return seen.size === RECOVERY_SUBSTRATES.length ? true : null
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
