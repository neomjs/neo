import {test, expect}                        from '@playwright/test';
import Neo                                   from '../../../../../../../src/Neo.mjs';
import * as core                             from '../../../../../../../src/core/_export.mjs';
import {gatherDimensionConsistencyDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/dimensionConsistencyGatherer.mjs';

// The live-Chroma audit+scheduling half of the dimension-consistency detect signal: it samples each
// collection via the (injected) dimension-audit primitive and feeds the samples to the pure producer.

const collections = [{collection: {}, collectionName: 'c1'}, {collection: {}, collectionName: 'c2'}];
const matchSample = name => ({collection: name, expectedDimension: 1024, mismatchedVectorCount: 0, sampledCount: 100});

test.describe('dimensionConsistencyGatherer', () => {
    test('samples every collection (one audit call each) and builds a diagnosis on a mismatch', async () => {
        const audited = [];
        const auditFn = async ({collectionName}) => {
            audited.push(collectionName);
            return collectionName === 'c1'
                ? {collection: 'c1', expectedDimension: 1024, mismatchedVectorCount: 3, sampledCount: 100}
                : matchSample('c2');
        };
        const diagnosis = await gatherDimensionConsistencyDiagnosis({collections, expectedDimension: 1024, serviceId: 'svc', observedAt: 1000, auditFn});
        expect(audited).toEqual(['c1', 'c2']);
        expect(diagnosis).not.toBeNull()
    });

    test('returns null when every sampled collection matches the dimension', async () => {
        const auditFn = async ({collectionName}) => matchSample(collectionName);
        expect(await gatherDimensionConsistencyDiagnosis({collections, expectedDimension: 1024, serviceId: 'svc', observedAt: 1000, auditFn})).toBeNull()
    });

    test('empty collections → null (nothing to diagnose)', async () => {
        expect(await gatherDimensionConsistencyDiagnosis({collections: [], expectedDimension: 1024, serviceId: 'svc', observedAt: 1000})).toBeNull()
    });

    test('a degraded audit (probe error, zero count) does not abort the gather — other mismatches still surface', async () => {
        const auditFn = async ({collectionName}) => collectionName === 'c1'
            ? {collection: 'c1', expectedDimension: 1024, mismatchedVectorCount: 0, sampledCount: 0, error: 'unreachable'}
            : {collection: 'c2', expectedDimension: 1024, mismatchedVectorCount: 2, sampledCount: 100};
        expect(await gatherDimensionConsistencyDiagnosis({collections, expectedDimension: 1024, serviceId: 'svc', observedAt: 1000, auditFn})).not.toBeNull()
    })
});
