import {test, expect}                        from '@playwright/test';
import Neo                                   from '../../../../../../../src/Neo.mjs';
import * as core                             from '../../../../../../../src/core/_export.mjs';
import {createLiveDimensionConsistencyGatherer, gatherDimensionConsistencyDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/dimensionConsistencyGatherer.mjs';

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

// The live-binding factory: owns the Memory Core collection resolution + config binding (moved out of the
// Orchestrator getter per #14226's placement RC), so the orchestrator just reads the AiConfig leaf at its
// use-site and injects the resolved deps. Injected storageRouter + auditFn keep it testable without live Chroma.
test.describe('createLiveDimensionConsistencyGatherer', () => {
    const makeRouter = () => {
        const calls = {ready: 0};
        return {
            calls,
            ready               : async () => { calls.ready++; },
            getMemoryCollection : async () => ({id: 'mem'}),
            getSummaryCollection: async () => ({id: 'sum'})
        };
    };

    test('resolves the memory + summary collections from the router, binds config, and builds a diagnosis on a mismatch', async () => {
        const router  = makeRouter(),
              audited = [],
              auditFn = async ({collectionName, expectedDimension}) => {
                  audited.push({collectionName, expectedDimension});
                  return {collection: collectionName, expectedDimension, mismatchedVectorCount: collectionName === 'neo-agent-memory' ? 4 : 0, sampledCount: 100};
              },
              gather    = createLiveDimensionConsistencyGatherer({storageRouter: router, expectedDimension: 1024, serviceId: 'mc-server', auditFn}),
              diagnosis = await gather(1000);
        expect(router.calls.ready).toBe(1);
        expect(audited.map(a => a.collectionName)).toEqual(['neo-agent-memory', 'neo-agent-sessions']);
        expect(audited.every(a => a.expectedDimension === 1024)).toBe(true);
        expect(diagnosis).not.toBeNull()
    });

    test('returns null when both live collections match the dimension', async () => {
        const router  = makeRouter(),
              auditFn = async ({collectionName, expectedDimension}) => ({collection: collectionName, expectedDimension, mismatchedVectorCount: 0, sampledCount: 100}),
              gather  = createLiveDimensionConsistencyGatherer({storageRouter: router, expectedDimension: 1024, serviceId: 'mc-server', auditFn});
        expect(await gather(1000)).toBeNull()
    });

    test('degrades to null (never throws) on a Chroma connection failure — coverage is not suppressed (#14130 AC3)', async () => {
        // ready() throws (Chroma down): an unguarded throw here would discard the already-gathered coverage
        // diagnosis in the shared evidence-gather and blank the whole sweep. Must resolve to null, not reject.
        const downRouter = {
            ready               : async () => { throw new Error('chroma connection refused'); },
            getMemoryCollection : async () => ({id: 'mem'}),
            getSummaryCollection: async () => ({id: 'sum'})
        };
        await expect(createLiveDimensionConsistencyGatherer({storageRouter: downRouter, expectedDimension: 1024, serviceId: 'mc-server'})(1000)).resolves.toBeNull();

        // mid-resolution failure (getCollection throws after a successful ready()) — same degrade.
        const midFailRouter = {
            ready               : async () => {},
            getMemoryCollection : async () => { throw new Error('chroma get failed'); },
            getSummaryCollection: async () => ({id: 'sum'})
        };
        await expect(createLiveDimensionConsistencyGatherer({storageRouter: midFailRouter, expectedDimension: 1024, serviceId: 'mc-server'})(1000)).resolves.toBeNull()
    })
});
