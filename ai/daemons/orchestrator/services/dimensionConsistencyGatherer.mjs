/**
 * @module ai/daemons/orchestrator/services/dimensionConsistencyGatherer
 * @summary Orchestrator live-Chroma gatherer for the dimension-consistency detect signal — the audit +
 * scheduling half that `dimensionConsistencyDiagnosis` (detect-only, samples-injected) deliberately omits.
 *
 * It runs the pure, embedder-free `auditCollectionVectorDimensions` primitive across the supplied live
 * collections to produce the producer's per-collection samples, then feeds them to
 * `buildDimensionConsistencyDiagnosis` to emit a `recovery-diagnosis` (or `null` when every sampled
 * collection's vectors match the configured embedding dimension).
 *
 * Degrade-not-throw: the audit primitive returns a zero-count sample with an `error` field on probe failure
 * rather than throwing, so one unreachable collection never aborts the gather — the remaining collections'
 * mismatches still surface. The audit is a read-only `.get` and does NOT invoke the embedder, so this
 * gatherer is not gated by the embed canary. Pure-ish: the only I/O is the injected collections' reads.
 */

import {auditCollectionVectorDimensions}    from '../../../scripts/maintenance/checkChromaIntegrity.mjs';
import {buildDimensionConsistencyDiagnosis} from './dimensionConsistencyDiagnosis.mjs';

/**
 * @summary Gathers per-collection vector-dimension samples from live Chroma collections and builds a
 * dimension-consistency `recovery-diagnosis`.
 *
 * @param {Object} options
 * @param {Array<{collection: Object, collectionName: String}>} [options.collections=[]] Live collections to audit.
 * @param {Number} options.expectedDimension The configured embedding dimension.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @param {Number} options.observedAt Epoch milliseconds when the audit is observed.
 * @param {Number} [options.sampleSize=100] Vectors to sample per collection.
 * @param {Function} [options.auditFn=auditCollectionVectorDimensions] The dimension-audit primitive — injectable for tests.
 * @returns {Promise<Object|null>} A `recovery-diagnosis` event when any collection has a dimension mismatch, else `null`.
 */
export async function gatherDimensionConsistencyDiagnosis({
    collections      = [],
    expectedDimension,
    serviceId,
    observedAt,
    sampleSize       = 100,
    auditFn          = auditCollectionVectorDimensions
} = {}) {
    const samples = [];

    for (const {collection, collectionName} of collections) {
        samples.push(await auditFn({collection, collectionName, expectedDimension, sampleSize}));
    }

    return buildDimensionConsistencyDiagnosis({samples, observedAt, serviceId});
}

/**
 * @summary Builds the live-Chroma dimension-consistency gatherer the data-integrity sweep schedules: it
 * resolves the Memory Core collections from the injected storage router and binds the producer config, then
 * returns a closure that runs {@link gatherDimensionConsistencyDiagnosis} over the resolved live collections.
 *
 * The live-collection resolution + config binding live here with the gatherer service (not in the
 * scheduling/orchestrator class): the orchestrator reads the AiConfig leaf at its use-site per the SSOT
 * discipline and injects the resolved `expectedDimension` + the `storageRouter`, keeping this module free of
 * config/Neo imports while owning the gather wiring. Injected `storageRouter` makes the factory testable in
 * isolation (no live Chroma).
 *
 * @param {Object} options
 * @param {Object} options.storageRouter The Memory Core storage router — supplies `ready()` +
 * `getMemoryCollection()` / `getSummaryCollection()`.
 * @param {Number} options.expectedDimension The configured embedding dimension (read at the orchestrator use-site).
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @param {Function} [options.auditFn] The dimension-audit primitive — passed through to the gatherer; injectable for tests.
 * @returns {Function} `async (observedAt) => Promise<Object|null>` — a dimension-mismatch recovery-diagnosis or null.
 */
export function createLiveDimensionConsistencyGatherer({storageRouter, expectedDimension, serviceId, auditFn} = {}) {
    return async observedAt => {
        // Degrade-not-throw at the live-binding boundary, not only inside the audit primitive (#14130 AC3).
        // A Chroma *connection* failure (storageRouter.ready / getCollection) must skip the dimension signal
        // for this cycle and return null — never throw. The shared `dataIntegrityEvidenceGatherer` gathers
        // coverage first then awaits this; an unguarded throw here would discard the already-gathered coverage
        // diagnosis and blank the whole hourly sweep. A down-Chroma is surfaced separately (coverage gatherer
        // + container-health), so a silent dimension-skip is the safe degrade; null is filtered downstream.
        try {
            await storageRouter.ready();
            const collections = [
                {collection: await storageRouter.getMemoryCollection(),  collectionName: 'neo-agent-memory'},
                {collection: await storageRouter.getSummaryCollection(), collectionName: 'neo-agent-sessions'}
            ];
            return await gatherDimensionConsistencyDiagnosis({collections, expectedDimension, serviceId, observedAt, auditFn});
        } catch (error) {
            return null;
        }
    };
}
