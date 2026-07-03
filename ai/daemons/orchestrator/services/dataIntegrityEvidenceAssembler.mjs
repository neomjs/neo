/**
 * @module ai/daemons/orchestrator/services/dataIntegrityEvidenceAssembler
 * @summary The glue between the detect-producers and the self-heal classifier: assembles per-collection
 * classifier-input rows from the producers' `recovery-diagnosis` events, augmenting with the two fields the
 * producers' `evidenceFacts` do not carry — per-collection `rowCount` (the false-storm-ratio denominator)
 * and `documentsPresentCount` (the WAL-stall-vs-wipe discriminator).
 *
 * The producers emit per-SIGNAL diagnoses (coverage-drift / dimension-mismatch / count-regression /
 * sqlite-integrity / store-bloat) with raw `evidenceFacts`; the classifier reads per-COLLECTION rows. This
 * re-groups the per-collection facts by collection and folds the store-level facts (sqlite / bloat) into a
 * single store-level row keyed by the service id.
 *
 * Pure (no I/O): the Orchestrator-side evidence gatherer runs the producers, reads the collection counts (the
 * coverage audit already has them) + the doc-presence audit, then calls this; the runner classifies the rows.
 *
 * @see ai/daemons/orchestrator/services/dataIntegrityModeClassifier.mjs
 * @see ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs
 */

/**
 * @summary Assembles the classifier-input rows from the producers' diagnoses + the augmenting audit data.
 *
 * @param {Object} options
 * @param {Object[]} [options.diagnoses=[]] The detect-producers' `recovery-diagnosis` events (each with `evidenceFacts`).
 * @param {Object} [options.collectionSizes={}] `{collection: rowCount}` — the per-collection stored-row counts (false-storm denominator).
 * @param {Object} [options.documentsPresentByCollection={}] `{collection: documentsPresentCount}` — the doc-presence audit (WAL-stall-vs-wipe).
 * @param {String} [options.serviceId='mc-server'] The Memory Core compose-service id (the store-level row's collection key).
 * @returns {Object[]} Per-collection classifier-input rows (+ one store-level row when a sqlite/bloat signal fired).
 */
export function assembleDataIntegrityEvidence({
    diagnoses                    = [],
    collectionSizes              = {},
    documentsPresentByCollection = {},
    serviceId                    = 'mc-server'
} = {}) {
    const byCollection = new Map();

    let sqliteIntegrityOk = true,
        sizeAnomaly       = false;

    const ensureRow = collection => {
        if (!byCollection.has(collection)) {
            byCollection.set(collection, {
                collection,
                rowCount              : collectionSizes[collection] ?? 0,
                missingFromVectorCount: 0,
                documentsPresentCount : documentsPresentByCollection[collection] ?? 0,
                mismatchedVectorCount : 0,
                countRegressed        : false
            });
        }
        return byCollection.get(collection);
    };

    for (const diagnosis of (Array.isArray(diagnoses) ? diagnoses : [])) {
        for (const fact of (Array.isArray(diagnosis?.evidenceFacts) ? diagnosis.evidenceFacts : [])) {
            switch (fact?.type) {
                case 'vector-coverage-drift':
                    ensureRow(fact.collection).missingFromVectorCount = fact.missingFromVectorCount ?? 0;
                    break;
                case 'vector-dimension-mismatch':
                    ensureRow(fact.collection).mismatchedVectorCount = fact.mismatchedVectorCount ?? 0;
                    break;
                case 'vector-count-regression':
                    ensureRow(fact.collection).countRegressed = (fact.currentCount ?? 0) < (fact.previousCount ?? 0);
                    break;
                case 'sqlite-integrity-failure':
                    sqliteIntegrityOk = false;
                    break;
                case 'store-bloat':
                    sizeAnomaly = true;
                    break;
            }
        }
    }

    const rows = [...byCollection.values()];

    // Store-level signals (SQLite integrity / store bloat) are not per-collection — fold them into one
    // store-level row keyed by the service id, so the classifier routes the store-level mode once.
    if (!sqliteIntegrityOk || sizeAnomaly) {
        rows.push({
            collection            : serviceId,
            rowCount              : 0,
            missingFromVectorCount: 0,
            documentsPresentCount : 0,
            mismatchedVectorCount : 0,
            countRegressed        : false,
            sqliteIntegrityOk,
            sizeAnomaly
        });
    }

    return rows;
}
