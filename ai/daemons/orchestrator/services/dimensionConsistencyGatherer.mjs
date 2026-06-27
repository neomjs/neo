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
